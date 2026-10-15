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
import { defaultProductHeaderSettings, themePresets } from "./defaults"
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

/*
  A LOOK OF THE CREATOR'S OWN, OR STORELIB'S (round 30). The product page follows the person's light or dark look on
  Storelib (lib/appearance) unless its creator gave it a look of their own: a scheme other than the default, a page colour
  that is not the default white, colours of their own on any part of it, or a page they arranged in the builder. Those
  keep exactly what the creator chose, in either look (data-own-look). A creator who never designed anything has the
  platform's default page, and that page is Storelib's, drawn in the person's look.

  WHAT STORELIB WROTE ITSELF IS NOT THE CREATOR'S (round 31, the owner: "in dark mode, opening a product from Explore
  lands on a white product page and a white header"). Round 30 read any stored colour and any section as the creator's.
  But the product template is written by Storelib, not by the creator: opening the builder once stores the default
  template (lib/store-builder/defaults defaultProductPageConfig: a Reviews and a More from section, and colours of
  "transparent"), and publishing the creator page writes the default scheme's own colours into it
  (components/store-builder/store-builder-context, every white, black and hairline of themePresets.default). So nearly
  every creator who had ever published had "a look of their own" that was Storelib's default, the page kept it light in
  the dark look, and its boot took the dark look off the whole document, the Storelib header with it.

  Now a stored colour is the creator's only when it is not what Storelib itself writes there (PLATFORM_COLOURS, read
  from the default scheme and the default settings, per place), and a page is arranged only when it has a section of the
  creator's: the Reviews and More from sections are Storelib's own, put on every product page whatever the template says.
*/
const OWN_COLOUR_SETTINGS = ["colors", "faqColors", "reviewsColors", "productCardColors", "priceContainerColors", "wishlistButtonColors", "viewInLibraryButtonColors", "buyButtonColor", "buyButtonTextColor"] as const
const DEFAULT_WHITE = new Set(["", "#fff", "#ffffff", "white"])
const d = themePresets.default
const lower = (xs: (string | undefined)[]) => xs.filter((x): x is string => typeof x === "string").map((x) => x.trim().toLowerCase())
/** Per setting, per colour in it: what Storelib writes there itself (the default scheme, the default settings). */
const PLATFORM_COLOURS: Record<(typeof OWN_COLOUR_SETTINGS)[number], string[] | Record<string, string[]>> = {
  colors: {
    backgroundColor: lower([d.sections.pageBackgroundColor, defaultProductHeaderSettings.colors?.backgroundColor]),
    textColor: lower([d.colors.foreground, defaultProductHeaderSettings.colors?.textColor]),
    accentColor: lower([defaultProductHeaderSettings.colors?.accentColor]),
  },
  faqColors: { textColor: lower([d.faqSection.textColor]), borderColor: lower([d.faqSection.borderColor]), iconColor: lower([d.faqSection.iconColor]) },
  reviewsColors: {
    textColor: lower([d.reviewsSection.textColor]),
    starColor: lower([d.reviewsSection.starColor]),
    cardBackgroundColor: lower([d.reviewsSection.cardBackgroundColor]),
    cardBorderColor: lower([d.reviewsSection.cardBorderColor]),
  },
  productCardColors: {
    textColor: lower([d.productCard.textColor]),
    priceColor: lower([d.productCard.priceColor]),
    backgroundColor: lower([d.productCard.backgroundColor]),
    borderColor: lower([d.productCard.borderColor]),
  },
  priceContainerColors: {
    backgroundColor: lower([d.priceContainer.backgroundColor]),
    textColor: lower([d.priceContainer.textColor]),
    mutedTextColor: lower([d.priceContainer.mutedTextColor]),
    borderColor: lower([d.priceContainer.borderColor]),
    iconColor: lower([d.priceContainer.iconColor]),
  },
  wishlistButtonColors: { backgroundColor: lower([d.wishlistButton.backgroundColor]), textColor: lower([d.wishlistButton.textColor]), borderColor: lower([d.wishlistButton.borderColor]) },
  viewInLibraryButtonColors: { backgroundColor: lower([d.viewInLibraryButton.backgroundColor]), textColor: lower([d.viewInLibraryButton.textColor]), borderColor: lower([d.viewInLibraryButton.borderColor]) },
  buyButtonColor: lower([d.productHeader.buyButtonColor]),
  buyButtonTextColor: lower([d.productHeader.buyButtonTextColor]),
}
/** Nothing there, or nothing that paints: never the creator's. */
const UNSET = new Set(["", "transparent", "inherit", "initial", "none"])
const platformWrote = (v: unknown, allowed: string[]) => typeof v !== "string" || UNSET.has(v.trim().toLowerCase()) || allowed.includes(v.trim().toLowerCase())

/** The sections Storelib puts on every product page itself: not the creator arranging anything. */
const PLATFORM_SECTIONS = new Set(["reviews", "more-from-seller"])
/** A page arranged in the builder: a section of the creator's own that is shown. */
export function productPageArranged(config: { sections?: unknown } | null | undefined): boolean {
  const sections = Array.isArray(config?.sections) ? (config!.sections as { type?: string; settings?: { visible?: boolean } }[]) : []
  return sections.some((s) => !!s && !PLATFORM_SECTIONS.has(String(s.type)) && s.settings?.visible !== false)
}

export function productHasOwnLook(config: (ProductPageToneInput & { sections?: unknown }) | null | undefined, arranged?: boolean): boolean {
  if (!config) return false
  if (arranged ?? productPageArranged(config)) return true
  if ((config.globalSettings?.themePreset || "default") !== "default") return true
  if (!DEFAULT_WHITE.has(String(config.globalColors?.backgroundColor ?? "").trim().toLowerCase())) return true
  const header = config.headerSettings as Record<string, unknown> | null | undefined
  return OWN_COLOUR_SETTINGS.some((k) => {
    const v = header?.[k]
    const allowed = PLATFORM_COLOURS[k]
    if (Array.isArray(allowed)) return !platformWrote(v, allowed)
    if (!v || typeof v !== "object") return false
    return Object.entries(v as Record<string, unknown>).some(([key, x]) => !platformWrote(x, allowed[key] ?? []))
  })
}

export function productPageTone(config: ProductPageToneInput | null | undefined, opts: { site?: boolean } = {}) {
  const headerSettings = config?.headerSettings
  const themePreset = config?.globalSettings?.themePreset || "default"
  /*
    STORELIB'S OWN LOOK (opts.site, a page with no look of the creator's: productHasOwnLook). With no store config at all,
    no scheme's literal colours: every part falls back to the design system's tokens (var(--background), var(--card),
    var(--foreground), the border and muted tokens), which are the default scheme's white, near black and hairline in the
    light look, and which app/theme-dark.css turns dark under html[data-sl-dark]. The buy button keeps its blue either way.

    Round 31: with a store config that is Storelib's own (the template the builder stores, the default scheme's colours
    publishing writes), the default scheme's colours, exactly as that page always had them in the light look; the page
    and its parts paint each one through lib/appearance/site-paint, so the dark look gives it its charcoal step.
  */
  const themeConfig = opts.site && !config ? undefined : themePresets[themePreset as ThemePreset]
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
