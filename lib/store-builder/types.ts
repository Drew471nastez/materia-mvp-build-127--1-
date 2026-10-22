// Store Builder Types
// JSON schema for page sections and settings

export type PageType = "shop" | "product"

export type SectionType =
  | "image-text"
  | "benefits"
  | "text-block"
  | "announcement-bar"
  | "featured-products"
  | "custom-html"
  | "more-from-seller"
  | "subscribe-bar"
  | "reviews" // Added reviews section type
  | "about" // About seller section
  | "faq" // FAQ section for product pages
  | "community" // One of the creator's communities, with live previews (components/store-builder/community-section.tsx)

export type DeviceType = "desktop" | "mobile"

export type SelectedElement = {
  sectionId: string
  elementType?: "cover" | "avatar" | "headline" | "bio" | "tags" | "image" | "text" | "button"
}

export type AvatarSizeChoice = "small" | "medium" | "large"

export interface SocialMediaLink {
  enabled: boolean
  url: string
}

/**
 * The three added later are optional because every stored config predates
 * them: making them required would mean every existing row failed to typecheck
 * against its own shape. Readers already use `socialLinks[key]?.url`.
 *
 * The keys themselves are declared in lib/social/platforms.ts — that is the
 * list the editor, the icons and the API all read.
 */
export interface SocialLinksConfig {
  instagram: SocialMediaLink
  tiktok: SocialMediaLink
  youtube: SocialMediaLink
  twitter: SocialMediaLink
  spotify: SocialMediaLink
  facebook?: SocialMediaLink
  linkedin?: SocialMediaLink
  twitch?: SocialMediaLink
}

// Navigation link for header
export interface NavLink {
  id: string
  label: string
  url: string
}

// Footer column types
export type FooterColumnType = "navigation" | "newsletter" | "social" | "custom-text"

// Footer settings
export interface FooterSettings {
  footerType: "simple" | "columns"
  columns: FooterColumnType[]
  // Advanced
  colorScheme?: string
  headingSize?: "h1" | "h2" | "h3" | "h4"
  textFontSize?: "large" | "medium" | "small"
  showPaymentIcons?: boolean
  showPoweredBy?: boolean
  sectionHeight?: number
  // Colors
  backgroundColor?: string
  textColor?: string
}

// Spacing configuration
export interface SpacingConfig {
  paddingTop?: number
  paddingBottom?: number
  paddingLeft?: number
  paddingRight?: number
  marginTop?: number
  marginBottom?: number
}

// Typography configuration
export interface TypographyConfig {
  fontSize?: number
  fontWeight?: "normal" | "medium" | "semibold" | "bold"
  textAlign?: "left" | "center" | "right"
  lineHeight?: number
}

// Color configuration
export interface ColorConfig {
  backgroundColor?: string
  textColor?: string
  accentColor?: string
}

export interface FocalPointConfig {
  x: number // 0-100
  y: number // 0-100
}

// Base section settings shared by all sections
export interface BaseSectionSettings {
  visible: boolean
  spacing: SpacingConfig
  mobileSpacing?: SpacingConfig
  colors: ColorConfig
  typography: TypographyConfig
  mobileTypography?: TypographyConfig
}

// Image + Text section
export interface ImageTextSettings extends BaseSectionSettings {
  headline: string
  body: string
  imageUrl: string
  imagePosition: "left" | "right"
  buttonText?: string
  buttonUrl?: string
  showButton: boolean
  imageFocalPoint?: FocalPointConfig
  // Button link type: 'product' links to a product, 'custom' uses custom URL
  buttonLinkType?: "product" | "custom"
  // Product ID when buttonLinkType is 'product'
  buttonProductId?: string
  // Product slug for routing when buttonLinkType is 'product'
  buttonProductSlug?: string
  // Button customization colors
  buttonColor?: string
  buttonTextColor?: string
  buttonBorderRadius?: number
}

// Benefits section (icon list)
export interface BenefitItem {
  id: string
  icon: string
  title: string
  description: string
  // Custom image support - when set, displays custom image instead of icon
  customImageUrl?: string
  // Icon type: 'preset' for lucide icons, 'custom' for uploaded images
  iconType?: 'preset' | 'custom'
}

export interface BenefitsSettings extends BaseSectionSettings {
  headline: string
  benefits: Array<BenefitItem>
  columns: 2 | 3 | 4
  // Carousel mode settings
  enableCarousel?: boolean
  autoplay?: boolean
  autoplaySpeed?: number // milliseconds between slides
  // Gap settings
  horizontalGap?: number // pixels
  verticalGap?: number // pixels
  // Theme-applied icon color
  iconColor?: string
}

// Text/Paragraph block section
export interface TextBlockSettings extends BaseSectionSettings {
  headline?: string
  body: string
  maxWidth: "sm" | "md" | "lg" | "full"
  // Theme-applied text colors
  headlineColor?: string
  contentColor?: string
}

// Announcement Bar section
export interface AnnouncementBarSettings extends BaseSectionSettings {
  text: string
  linkText?: string
  linkUrl?: string
  linkProductId?: string // Added support for linking to products from the store
  linkProductSlug?: string // Store slug for proper routing
  textSize: number // Font size in px
  dismissible: boolean
  enableUnderline?: boolean // Toggle to enable underline for clickable text
}

// Featured Products section
export interface FeaturedProductsSettings extends BaseSectionSettings {
  headline: string
  productIds: string[] // specific product IDs to feature, empty = show all

  // NEW: controls mobile grid layout
  mobileListing: 1 | 2

  // Deprecated (keep so old saved configs don't crash)
  maxProducts?: number
  columns?: 2 | 3 | 4

  showPrice: boolean
  showCompareAtPrice?: boolean // Show compare at (strikethrough) price
  hideCategoryFilter?: boolean // Hide the category filter sidebar/pills

  // Product card styling from theme
  productCardColors?: {
    backgroundColor?: string
    textColor?: string
    priceColor?: string
    borderColor?: string
  }
  // Category filter styling from theme
  categoryFilterColors?: {
    textColor?: string
    activeTextColor?: string
    borderColor?: string
  }

  // Deprecated - kept for backwards compatibility
  showDescription?: boolean
}

export interface MoreFromSellerSettings extends BaseSectionSettings {
  headline: string
  columns: 2 | 3 | 4
  maxProducts: number
  showPrice: boolean
  showCompareAtPrice?: boolean // Show compare at (strikethrough) price
  hideCategoryFilter?: boolean // Hide the category filter sidebar/pills

  // Mobile products per row setting (1 or 2)
  mobileProductsPerRow?: 1 | 2

  // Product card styling from theme
  productCardColors?: {
    backgroundColor?: string
    textColor?: string
    priceColor?: string
    borderColor?: string
  }

  // Deprecated - kept for backwards compatibility
  showDescription?: boolean
}

// Subscribe Bar settings for shop homepage
export interface SubscribeBarSettings extends BaseSectionSettings {
  text: string
  customCtaText?: string // Added customCtaText for custom CTA override
  placeholder: string
  buttonText: string
  buttonTextPreset: "subscribe" | "get_now" | "grab_it" | "download" | "buy_now" | "join_now" | "sign_up" | "custom"
  customButtonText?: string
  buttonColor: string
  buttonTextColor: string
  buttonBorderRadius?: number // Border radius for button and input
  inputBorderColor?: string // Border color for email input
  inputTextColor?: string // Text color for email input
  inputPlaceholderColor?: string // Placeholder text color for email input
  inputBackgroundColor?: string // Background color for email input
  showAvatar: boolean
  position: "top" | "bottom"
  /** Which sentence the bar generates. Six of them; see getStyleText. */
  style: "style1" | "style2" | "style3" | "style4" | "style5" | "style6"
  enableStickyBar?: boolean // When on, bar sticks to top when scrolling
  enableStickyOnScrollUp?: boolean // When on, bar only shows when scrolling up (smooth behavior)
  /**
   * Set the first time a creator moves the sticky toggle themselves.
   *
   * `enableStickyBar` alone cannot carry the default, because the builder
   * writes the whole settings object out on every save whether or not anyone
   * touched that switch — and it defaulted to OFF for as long as it existed.
   * So essentially every stored config on the platform holds an explicit
   * `false` that never represented a decision, and `?? true` cannot see past
   * it (`false ?? true` is `false`).
   *
   * This flag is what tells the two apart: absent means "nobody has chosen,
   * use the platform default (sticky on)", present means "this creator
   * decided, honour `enableStickyBar` exactly as stored — including off".
   *
   * The migration in supabase/migrations that backfills the legacy `false`s
   * sets this too, so it stops mattering once that has run everywhere.
   */
  stickyBarChoiceMade?: boolean
  /**
   * WHICH OF THE BAR'S FOUR COLOURS A CREATOR ACTUALLY PICKED.
   *
   * Same problem as `stickyBarChoiceMade`, same answer. The builder writes the
   * whole settings object out on every save, so nearly every config on the
   * platform carries a white background, black text and a #2563eb button that
   * nobody ever chose. `resolveStorefrontChrome` used to tell those apart by
   * looking at the colour, which means a creator who picks white text on their
   * button picks a value the resolver reads as "nobody chose" and the scheme
   * paints over it. From the outside that is a save that does nothing.
   *
   * Names of the fields that were picked, one entry each, added as they are
   * picked and never removed. Absent means nobody has chosen anything yet and
   * the old value-sniffing rule still applies, so existing pages do not move.
   */
  colorChoices?: string[]
  buttonStyle?: "style1" | "style2" | "style3" | "style4" // Button text style preset
}

export interface ReviewsSettings extends BaseSectionSettings {
  headline: string
  showAverageRating: boolean
  showReviewCount: boolean
  showStarRatings?: boolean
  maxReviewsToShow: number
  // Theme-applied reviews colors
  reviewsColors?: {
    starColor?: string
    cardBackgroundColor?: string
    cardBorderColor?: string
  }
}

// About media item (image or YouTube embed)
export interface AboutMediaItem {
  id: string
  /**
   * `"youtube"` is the LEGACY label for a video and still arrives from stored
   * rows written before Vimeo was supported. New items are written as
   * `"video"`, and the provider is derived from the URL by lib/social/video —
   * so adding a provider does not mean migrating every row that predates it.
   * Nothing should branch on which of the two a video says.
   */
  type: "image" | "youtube" | "video"
  url: string
  caption?: string // Optional caption text for the media item
}

// Payment method types
export type PaymentMethodType = "paypal" | "visa" | "mastercard" | "amex" | "applepay" | "googlepay"

// About section for seller/shop information
export interface AboutSettings extends BaseSectionSettings {
  // Seller display name (used when no headline)
  sellerName: string
  // Main headline (e.g., "About my shop")
  headline: string
  // About content/bio paragraph
  aboutContent: string
  // Media items (images and videos)
  mediaItems: AboutMediaItem[]
  // Stats visibility
  showSalesStats: boolean
  showProductsStats?: boolean
  // Member since date (ISO string)
  memberSince?: string
  // Total sales count (fetched from system, but can be displayed/hidden)
  totalSales?: number
  // Products count (fetched from system, but can be displayed/hidden)
  productsCount?: number
  // Max content height before "Read more" (in pixels)
  maxContentHeight?: number
  // Payment methods to display
  showPaymentMethods?: boolean
  paymentMethods?: PaymentMethodType[]
  // Theme-applied muted text color
  mutedTextColor?: string
}

// FAQ item for product pages
export interface FAQItem {
  id: string
  question: string
  answer: string
  isDefault?: boolean // Default FAQs cannot be deleted
}

// FAQ section for product pages
export interface FAQSettings extends BaseSectionSettings {
  headline: string
  // Custom FAQs (up to 4 additional ones) - kept for backward compatibility
  customFaqs: FAQItem[]
  // All FAQs in order (defaults + custom) - used for combined ordering
  allFaqs?: FAQItem[]
}

/**
 * One of the creator's own communities on their page. The live part (the
 * name, the figures, the previews) is read on the server for the page
 * (lib/communities/server/blocks.ts); these are only the creator's choices.
 * Nothing draws while the communities switch is off, or when the community
 * is not published and public.
 */
export interface CommunitySettings extends BaseSectionSettings {
  /** The community's id, one of this creator's. Empty until one is picked. */
  communityId: string
  /** Shown above the card; empty means the community's own name is the heading. */
  headline: string
  showStats: boolean
  showEvents: boolean
  showPosts: boolean
  showMembers: boolean
  showLeaderboard: boolean
  showReviews: boolean
  showJoin: boolean
}

// Union of all section settings
export type SectionSettings =
  | ImageTextSettings
  | BenefitsSettings
  | TextBlockSettings
  | AnnouncementBarSettings
  | FeaturedProductsSettings
  | MoreFromSellerSettings
  | SubscribeBarSettings
  | ReviewsSettings
  | AboutSettings
  | FAQSettings
  | CommunitySettings

// Section definition
export interface Section {
  id: string
  type: SectionType
  settings: SectionSettings
  order: number
  locked?: boolean // For core sections that cannot be deleted/moved
}

// Header settings for shop page
export interface ShopHeaderSettings {
  /**
   * A PUBLIC contact address, typed by the creator, empty by default.
   *
   * Deliberately not the address they sign in with: publishing that, without
   * being asked, on a page anybody can read is not a feature. The About block
   * shows a Contact link only when this is set, and clearing it removes the
   * link.
   */
  contactEmail?: string
  coverImageUrl?: string
  coverFocalPoint?: FocalPointConfig
  /**
   * How much bigger than "just covers the band" the cover is drawn, 1 to 4.
   * Absent is 1, which is every cover saved before it existed. Pinched into
   * place in the profile sheet; see lib/images/cover-crop.
   */
  coverZoom?: number
  coverBrightness?: number // Added cover image brightness control (0.7-1.3 range)
  avatarUrl?: string // Avatar image URL, empty string means show initials placeholder
  avatarSize: number // desktop size in px (legacy, kept for backwards compat)
  mobileAvatarSize: number // mobile size in px (legacy, kept for backwards compat)
  avatarSizeChoice?: AvatarSizeChoice // 'small' | 'medium' | 'large'
  mobileAvatarSizeChoice?: AvatarSizeChoice // 'small' | 'medium' | 'large'
  profileImageBorderColor?: string // Border color for the profile image circle
  bio?: string // Bio text that can be edited from header settings
  /**
   * The order the creator dragged their catalogue into, as product ids.
   *
   * Only the Products tab reads it; Featured keeps its own `productIds`,
   * which is a selection rather than an arrangement. Anything not listed
   * here still appears — see applyManualOrder — so a product added after an
   * arrangement was saved does not quietly vanish from its own shop.
   */
  productsOrder?: string[]
  showHeadline: boolean
  showBio: boolean
  showStats: boolean
  showTotalSalesBadge: boolean
  /**
   * The meta row's three items, individually. `showStats` is the master and
   * these sit under it — a creator who wants their followers shown and their
   * rating hidden had no way to say so, because the only control was
   * all-or-nothing.
   *
   * Optional and treated as true when absent: every stored config predates
   * them, and a creator who has never opened the control has not asked for
   * anything to disappear.
   */
  showReviews?: boolean
  /** Read by nothing since round 38: a creator page shows no followers or following at all. Kept so stored configs still type. */
  showFollowers?: boolean
  /*
    showCategory and showNicheTags were here. They switched a category pill
    above the bio, and that pill is gone: a creator's niche is how Explore
    files them, not something a visitor needs read to them before the bio.
    Old stored configs still carry the keys and that is harmless — nothing
    reads them. Do not re-add the pill.
  */
  showSocialMedia?: boolean
  showSocialIconsOnMobile?: boolean // Added toggle for mobile social icons
  socialMediaIconColor?: string
  socialMediaIconStyle?: "default" | "filled" | "outlined" // Icon style: default, filled circle, or outlined
  socialLinks?: SocialLinksConfig
  faviconUrl?: string
  // Logo settings
  logoUrl?: string
  logoHeight?: number
  useMobileLogo?: boolean
  mobileLogoUrl?: string
  // Navigation links
  navLinks?: NavLink[]
  colors: ColorConfig
  spacing: SpacingConfig
  // Subscribe bar settings embedded in header for shop pages
  subscribeBar?: SubscribeBarSettings
  // Texts color for header elements (stats text, icons, seller name, bio description)
  textsColor?: string
}

// Header settings for product page (locked but editable)
export interface ProductHeaderSettings {
  showGallery: boolean
  showBadges: boolean
  showCreatorInfo: boolean
  showWhatsIncluded: boolean
  showDescription?: boolean
  showFaqs?: boolean
  // Mobile gallery dots navigation (instead of thumbnails, with autoplay)
  mobileGalleryDots?: boolean
  // Desktop gallery dots navigation (instead of thumbnails, with autoplay)
  desktopGalleryDots?: boolean
  // Buy button customization
  buyButtonColor?: string
  buyButtonTextColor?: string
  // Buttons border radius (Add to Cart, Buy, Wishlist)
  buttonsBorderRadius?: number
  // New toggles
  /* showSalesAnnouncement was here. Old stored configs still carry it and
     nothing reads it: the line it printed is gone. */
  showRatingNextToSeller?: boolean // Show stars next to seller name
  colors: ColorConfig
  spacing: SpacingConfig
  // Product page specific settings
  creatorBar?: ProductCreatorBarSettings
  stickyAddToCart?: StickyAddToCartSettings
  // Theme-applied color settings for product page components
  faqColors?: {
    textColor?: string
    borderColor?: string
    iconColor?: string
  }
  reviewsColors?: {
    textColor?: string
    starColor?: string
    cardBackgroundColor?: string
    cardBorderColor?: string
  }
  productCardColors?: {
    textColor?: string
    priceColor?: string
    backgroundColor?: string
    borderColor?: string
  }
  priceContainerColors?: {
    backgroundColor?: string
    textColor?: string
    mutedTextColor?: string
    borderColor?: string
    iconColor?: string
  }
  wishlistButtonColors?: {
    backgroundColor?: string
    textColor?: string
    borderColor?: string
  }
  viewInLibraryButtonColors?: {
    backgroundColor?: string
    textColor?: string
    borderColor?: string
  }
}

// Creator bar settings for product pages (like Subscribe Bar but with creator name)
export interface ProductCreatorBarSettings {
  visible: boolean
  /**
   * Whether the follow form is on the bar. Absent means yes, because every
   * config predates the switch and the bar has always had one.
   */
  showSubscribe?: boolean
  backgroundColor: string
  textColor: string
  buttonColor: string
  buttonTextColor: string
  buttonStyle: "style1" | "style2" | "style3" | "style4"
  buttonBorderRadius?: number
}

// Sticky Add to Cart settings
export interface StickyAddToCartSettings {
  visible: boolean
  backgroundColor: string
  buttonColor: string
  buttonTextColor: string
  buttonStyle: "add_to_cart" | "grab_it" | "grab_me" | "download" | "get_it"
  borderRadius: number
  borderColor?: string // Border color for the sticky bar
  textColor?: string // Text color for the sticky bar content
}

// Full page configuration
export interface PageConfig {
  pageType: PageType
  headerSettings: ShopHeaderSettings | ProductHeaderSettings
  sections: Section[]
  globalColors?: ColorConfig
  globalSettings?: GlobalStoreSettings // Global store settings (Basic Info, SEO, Verified Badge, Theme)
  version: number // For tracking changes
}

export type SaveState = "unsaved" | "saving" | "saved" | "publishing" | "published"

// Theme preset for global styling
export type ThemePreset = "default" | "air" | "astrid" | "bubble" | "pink" | "cream" | "sage" | "harbor" | "clay" | "graphite" | "blacks" | "fusion"

// Verified badge type options
export type VerifiedBadgeType = "verified_creator" | "verified_brand" | "verified_business" | "official_page" | "verified_artist"

// Global store settings
export interface GlobalStoreSettings {
  // Basic Info
  storeName: string
  storeTagline?: string
  storeBio?: string
  storeNicheTags?: string[]

  // SEO
  seoTitle?: string
  seoDescription?: string
  socialImageUrl?: string

  // Verified Badge
  verifiedBadgeEnabled: boolean
  verifiedBadgeType: VerifiedBadgeType

  // Theme
  themePreset: ThemePreset

  // Theme overrides (when themePreset is applied, these are the computed values)
  themeColors?: {
    primary: string
    secondary: string
    accent: string
    background: string
    foreground: string
    muted: string
    border: string
  }
  themeBorderRadius?: number // Global border radius for buttons, cards, etc.
  // Footer settings
  footerSettings?: FooterSettings
}

export interface ProductTemplate {
  id: string
  name: string
  config: PageConfig
  isDefault: boolean
  productIds: string[] // Products using this template
  createdAt: string
  updatedAt: string
}

// Store Builder Config from database
export interface StoreBuilderConfig {
  id: string
  creator_id: string
  page_type: PageType
  draft_config: PageConfig
  draft_updated_at: string | null
  published_config: PageConfig
  published_at: string | null
  created_at: string
  updated_at: string
  product_id?: string // For product-specific configs
}

// Section library item for adding new sections
export interface SectionLibraryItem {
  type: SectionType
  name: string
  description: string
  icon: string
  defaultSettings: SectionSettings
  previewImage?: string
}
