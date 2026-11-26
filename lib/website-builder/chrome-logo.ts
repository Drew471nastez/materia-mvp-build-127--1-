/**
 * ===========================================================================
 *  A HEADER OF ONE'S OWN SHOWS THE LOGO THE CREATOR ALREADY UPLOADED
 * ===========================================================================
 * The owner: "coded headers and footers are bugged: the logo doesn't show,
 * it disappears." The built-in header keeps its logo in its OWN settings
 * (header.logo_url, picked in the header's panel), and only falls back to
 * Theme settings › Branding. A coded header reads `theme.logo`, which read
 * Branding alone. So the moment the AI wrote a header of its own, a logo
 * uploaded in the header's panel was nowhere it could see, and the new header
 * drew the store's name or an empty box.
 *
 * The theme's logo is now the Branding logo, and when Branding has none, the
 * built-in header's: picture, phone picture, heights and words. Applied where
 * a page is drawn with its sections in hand (lib/website-builder/
 * storefront-render.ts for the live site, the canvas's StorelibLiveProvider),
 * so the builder and the published page agree. The built-in header is kept
 * on the page (hidden) when a coded one replaces it, which is what makes its
 * settings readable here.
 */
import type { SectionInstance, ThemeSettingsValues } from "./types"
import { headerIconOn } from "./header-icons"

export interface HeaderLogo {
  logo_url: string
  mobile_logo_url: string
  use_mobile_logo: boolean
  logo_height: number | null
  mobile_logo_height: number | null
  logo_text: string
  /**
   * Round 66: the header's wishlist icon. Off, the store has no wishlist a visitor can reach, so no section draws
   * a heart (themeWithHeaderLogo sets `wishlist_off`, lib/website-builder/storelib-runtime.ts reads it).
   */
  wishlist_icon?: boolean
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "")
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : typeof v === "string" && Number(v) > 0 ? Number(v) : null)

/** The built-in header's logo on this page, or null when there is none to read. */
export function headerLogoOf(sections: readonly SectionInstance[] | null | undefined): HeaderLogo | null {
  const header = (sections ?? []).find((s) => s.type === "header")
  if (!header) return null
  const s = (header.settings ?? {}) as Record<string, unknown>
  /* A header set to show its name in words has no picture to lend, even if one was uploaded once. */
  const wordsOnly = str(s.logo_mode) === "text"
  const logo = wordsOnly ? "" : str(s.logo_url)
  const out: HeaderLogo = {
    logo_url: logo,
    mobile_logo_url: wordsOnly ? "" : str(s.mobile_logo_url),
    use_mobile_logo: s.use_mobile_logo === true,
    logo_height: num(s.logo_height),
    mobile_logo_height: num(s.mobile_logo_height),
    logo_text: str(s.logo_text),
  }
  if (!headerIconOn(s.show_wishlist_icon)) out.wishlist_icon = false
  return out.logo_url || out.logo_text || out.mobile_logo_url || out.wishlist_icon === false ? out : null
}

/**
 * The theme a section reads, with the header's logo where Branding has none.
 * Branding wins whenever it has a picture: it is the site-wide setting. The
 * same object back when there is nothing to add, so memoised callers stay put.
 */
export function themeWithHeaderLogo(theme: ThemeSettingsValues, logo: HeaderLogo | null): ThemeSettingsValues {
  if (!logo) return theme
  const t = theme as unknown as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  if (!str(t.logo_url) && logo.logo_url) {
    patch.logo_url = logo.logo_url
    if (logo.use_mobile_logo && logo.mobile_logo_url && !str(t.mobile_logo_url)) {
      patch.use_mobile_logo = true
      patch.mobile_logo_url = logo.mobile_logo_url
    }
  }
  if (num(t.logo_height) === null && logo.logo_height !== null) patch.logo_height = logo.logo_height
  if (num(t.mobile_logo_height) === null && logo.mobile_logo_height !== null) patch.mobile_logo_height = logo.mobile_logo_height
  if (!str(t.brand_name) && logo.logo_text) patch.brand_name = logo.logo_text
  if (logo.wishlist_icon === false && t.wishlist_off !== true) patch.wishlist_off = true
  return Object.keys(patch).length ? ({ ...t, ...patch } as unknown as ThemeSettingsValues) : theme
}
