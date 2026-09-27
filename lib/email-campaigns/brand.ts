/**
 * ===========================================================================
 *  THE CREATOR'S LOOK, AS AN EMAIL CAN CARRY IT
 * ===========================================================================
 * Every email a creator sends, a campaign or an automation, is drawn in
 * their store's name, logo and colour, read when the email is sent rather
 * than copied into it when it was written, so a new logo or colour is in the
 * next email without anybody touching the old ones.
 *
 * A colour somebody picked for a website is not automatically a colour a
 * button can wear: a pale yellow button on a white email disappears, and
 * white words on it cannot be read. So the accent is checked here, by the
 * WCAG contrast formula, before any email uses it:
 *
 *   the button    its words are white or ink, whichever reads better on it,
 *                 and a fill too close to the white card (under 1.6:1) is
 *                 replaced by the default ink, so the button is always seen
 *   links         in the accent when it reads as text on white (4.5:1, the
 *                 WCAG AA rule for body text), otherwise ink, underlined
 *                 either way
 *
 * Pure and browser-safe: the compose page's preview and the server's send
 * both draw with the same numbers.
 */

import { APP_ORIGIN } from "@/lib/email-variables"

export const DEFAULT_ACCENT = "#1a1a2e"
export const INK = "#111827"
export const CARD = "#ffffff"

export interface Brand {
  /** The store's name: the website's own name, else the creator's display name. */
  name: string
  /** An https picture of the logo, or null for the name in type. */
  logoUrl: string | null
  /** Where the logo and the name link to. */
  storeUrl: string | null
  /** The accent as picked, before the contrast check. */
  accent: string
  /** One line of postal address for the footer, or null when none is set. */
  address: string | null
}

/** What the drawing uses: the accent after the checks, and what goes on it. */
export interface EmailTheme {
  /** The button's fill. */
  button: string
  /** The words on the button. */
  buttonText: string
  /** Links in running text. */
  link: string
}

export const DEFAULT_BRAND: Brand = { name: "Storelib", logoUrl: null, storeUrl: null, accent: DEFAULT_ACCENT, address: null }

/** #rgb or #rrggbb as #rrggbb, lower case; anything else is null. */
export function hexColor(value: unknown): string | null {
  if (typeof value !== "string") return null
  const v = value.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(v)) return v
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`
  return null
}

/** Relative luminance, WCAG 2.1. */
export function luminance(hex: string): number {
  const h = hexColor(hex) ?? DEFAULT_ACCENT
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** The contrast ratio of two colours, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const x = luminance(a)
  const y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** White or ink on a fill, whichever has more contrast. */
export function textOn(fill: string): string {
  return contrast(fill, "#ffffff") >= contrast(fill, INK) ? "#ffffff" : INK
}

/** The minimum a button's fill needs against the white card to be seen as a button. */
export const BUTTON_ON_CARD = 1.6
/** WCAG AA for body text. */
export const TEXT_AA = 4.5

export function themeOf(brand: Pick<Brand, "accent">): EmailTheme {
  const accent = hexColor(brand.accent) ?? DEFAULT_ACCENT
  const button = contrast(accent, CARD) >= BUTTON_ON_CARD ? accent : DEFAULT_ACCENT
  return {
    button,
    buttonText: textOn(button),
    link: contrast(accent, CARD) >= TEXT_AA ? accent : INK,
  }
}

/** A fill a creator chose for one button, or the brand's when they chose none. */
export function buttonColors(chosen: unknown, theme: EmailTheme): { fill: string; text: string } {
  const own = hexColor(chosen)
  if (!own) return { fill: theme.button, text: theme.buttonText }
  const fill = contrast(own, CARD) >= BUTTON_ON_CARD ? own : DEFAULT_ACCENT
  return { fill, text: textOn(fill) }
}

/** An https address, or null. Nothing else goes into an email as a picture. */
export function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null
  const v = value.trim()
  if (!v || v.length > 2048) return null
  try {
    const u = new URL(v)
    if (u.protocol !== "https:" || !u.hostname || u.username || u.password) return null
    return u.toString()
  } catch {
    return null
  }
}

/**
 * A profile photo or a logo as an email can show it: an https address, with
 * a path on our own site ("/avatars/a.png") made whole, and never the old
 * placeholder picture (lib/account/avatar profileAvatar). Null draws the
 * name's initial instead.
 */
export function emailImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null
  const v = value.trim()
  if (!v || /placeholder\.svg/i.test(v)) return null
  if (v.startsWith("/") && !v.startsWith("//")) return httpsUrl(`${APP_ORIGIN}${v}`)
  return httpsUrl(v)
}

/**
 * The address as one line: "12 Main St, Suite 4, Springfield, IL 62701,
 * United States". Null unless it has at least a street and a city or postal
 * code, because half an address is not an address.
 */
export function addressLine(parts: {
  line1?: unknown
  line2?: unknown
  city?: unknown
  state?: unknown
  postal?: unknown
  country?: unknown
}): string | null {
  const t = (v: unknown) => (typeof v === "string" ? v.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) : "")
  const line1 = t(parts.line1)
  const city = t(parts.city)
  const postal = t(parts.postal)
  if (!line1 || (!city && !postal)) return null
  const statePostal = [t(parts.state), postal].filter(Boolean).join(" ")
  return [line1, t(parts.line2), city, statePostal, t(parts.country)].filter(Boolean).join(", ")
}

/** A display name as the email shows it: one line, no markup, not too long. */
export function brandName(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (typeof c !== "string") continue
    const v = c.replace(/[\r\n\t<>]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)
    if (v) return v
  }
  return DEFAULT_BRAND.name
}
