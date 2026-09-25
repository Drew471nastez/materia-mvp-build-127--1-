/**
 * ===========================================================================
 *  THE PRODUCT PAGE'S COLOURS, FROM ITS SCHEME
 * ===========================================================================
 * Out of app/(marketing)/p/[slug]/page.tsx so the page and
 * scripts/check-creator-chrome.mjs read one answer: the probe measures what
 * this returns on the real components, per scheme, and the page paints it.
 *
 * DARK. Decided by the scheme's page colour (./scheme-tone), the rule the
 * creator page already used, so a dark scheme opens onto a dark product page
 * whatever it is called.
 *
 * THE PAGE'S OWN COLOUR. The page painted `globalColors.backgroundColor`, which
 * only the builder's theme button writes. A scheme picked in Edit profile
 * saves the scheme alone, so on a dark scheme the stored colour was still the
 * builder's untouched white, under the scheme's near-white type. On a dark
 * scheme the colour is now resolved as the creator page resolves it: a stored
 * colour somebody chose wins, the builder's inherited white does not. A light
 * scheme keeps exactly what it painted before.
 */
import { themePresets } from "./defaults"
import { isDarkScheme } from "./scheme-tone"
import { resolveStorefrontChrome } from "./storefront-chrome"
import type { ThemePreset } from "./types"

/** The parts of a product page config this reads. Loose on purpose: the page's config is `any`. */
export interface ProductPageToneInput {
  globalSettings?: { themePreset?: string | null } | null
  globalColors?: { backgroundColor?: string | null } | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  headerSettings?: any
}

export function productPageTone(config: ProductPageToneInput | null | undefined) {
  const headerSettings = config?.headerSettings
  const themePreset = config?.globalSettings?.themePreset || "default"
  const themeConfig = themePresets[themePreset as ThemePreset]
  const isDarkTheme = isDarkScheme(themePreset)
  const stored = config?.globalColors?.backgroundColor || undefined

  /** What the page's root is painted with; undefined is the design system's background. */
  const pageBackgroundColor = isDarkTheme
    ? resolveStorefrontChrome(themePreset, { pageBackground: stored }).pageBackground
    : stored

  // CRITICAL: Theme colors ALWAYS come from the theme preset to ensure global consistency
  // This ensures that when a theme preset is applied on any product page, ALL products get the same colors
  const themeColors = {
    // Page and text colors - prioritize theme preset, then globalColors, then fallback
    pageBackground: themeConfig?.sections?.pageBackgroundColor || stored || "var(--background)",
    textColor: themeConfig?.colors?.foreground || headerSettings?.colors?.textColor || "inherit",
    // FAQ section colors - ALWAYS from theme preset for global consistency
    faqTextColor: themeConfig?.faqSection?.textColor || headerSettings?.faqColors?.textColor,
    faqBorderColor: themeConfig?.faqSection?.borderColor || headerSettings?.faqColors?.borderColor,
    faqIconColor: themeConfig?.faqSection?.iconColor || headerSettings?.faqColors?.iconColor,
    // Reviews section colors - ALWAYS from theme preset for global consistency
    reviewsTextColor: themeConfig?.reviewsSection?.textColor || headerSettings?.reviewsColors?.textColor,
    reviewsStarColor: themeConfig?.reviewsSection?.starColor || headerSettings?.reviewsColors?.starColor,
    reviewsCardBackground: themeConfig?.reviewsSection?.cardBackgroundColor || headerSettings?.reviewsColors?.cardBackgroundColor,
    reviewsCardBorder: themeConfig?.reviewsSection?.cardBorderColor || headerSettings?.reviewsColors?.cardBorderColor,
    // Product card colors (for price cards, containers) - ALWAYS from theme preset
    cardBackground: themeConfig?.priceContainer?.backgroundColor || headerSettings?.productCardColors?.backgroundColor,
    cardTextColor: themeConfig?.priceContainer?.textColor || headerSettings?.productCardColors?.textColor,
    cardPriceColor: themeConfig?.priceContainer?.mutedTextColor || headerSettings?.productCardColors?.priceColor,
    cardBorderColor: themeConfig?.priceContainer?.borderColor || headerSettings?.productCardColors?.borderColor,
    cardIconColor: themeConfig?.priceContainer?.iconColor || headerSettings?.productCardColors?.textColor,
    // View in Library button colors - ALWAYS from theme preset
    viewInLibraryBg: themeConfig?.viewInLibraryButton?.backgroundColor,
    viewInLibraryText: themeConfig?.viewInLibraryButton?.textColor,
    viewInLibraryBorder: themeConfig?.viewInLibraryButton?.borderColor,
  }

  /** The category pill beside the title. */
  const categoryBadgeStyle = isDarkTheme
    ? { backgroundColor: "#2a2a2a", color: "#fafafa", borderColor: "#3a3a3a" }
    : themePreset === "cream"
      ? { backgroundColor: "#ffffff", color: "#000000", borderColor: "#e8dfc9" }
      : undefined

  /** The star beside the seller's rating. */
  const ratingStarColor = isDarkTheme ? "#fafafa" : "#000000"

  return { themePreset, themeConfig, isDarkTheme, pageBackgroundColor, themeColors, categoryBadgeStyle, ratingStarColor }
}
