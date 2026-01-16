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

export interface SocialLinksConfig {
  instagram: SocialMediaLink
  tiktok: SocialMediaLink
  youtube: SocialMediaLink
  twitter: SocialMediaLink
  spotify: SocialMediaLink
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
}

// Text/Paragraph block section
export interface TextBlockSettings extends BaseSectionSettings {
  headline?: string
  body: string
  maxWidth: "sm" | "md" | "lg" | "full"
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
  style: "style1" | "style2" | "style3"
  enableStickyBar?: boolean // When on, bar sticks to top when scrolling
  enableStickyOnScrollUp?: boolean // When on, bar only shows when scrolling up (smooth behavior)
  buttonStyle?: "style1" | "style2" | "style3" | "style4" // Button text style preset
}

export interface ReviewsSettings extends BaseSectionSettings {
  headline: string
  showAverageRating: boolean
  showReviewCount: boolean
  showStarRatings?: boolean
  maxReviewsToShow: number
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
  coverImageUrl?: string
  coverFocalPoint?: FocalPointConfig
  coverBrightness?: number // Added cover image brightness control (0.7-1.3 range)
  avatarUrl?: string // Avatar image URL, empty string means show initials placeholder
  avatarSize: number // desktop size in px (legacy, kept for backwards compat)
  mobileAvatarSize: number // mobile size in px (legacy, kept for backwards compat)
  avatarSizeChoice?: AvatarSizeChoice // 'small' | 'medium' | 'large'
  mobileAvatarSizeChoice?: AvatarSizeChoice // 'small' | 'medium' | 'large'
  profileImageBorderColor?: string // Border color for the profile image circle
  showHeadline: boolean
  showBio: boolean
  showNicheTags: boolean
  showStats: boolean
  showTotalSalesBadge: boolean
  showSocialMedia?: boolean
  showSocialIconsOnMobile?: boolean // Added toggle for mobile social icons
  socialMediaIconColor?: string
  socialMediaIconStyle?: "default" | "filled" | "outlined" // Icon style: default, filled circle, or outlined
  socialLinks?: SocialLinksConfig
  faviconUrl?: string
  colors: ColorConfig
  spacing: SpacingConfig
  // Subscribe bar settings embedded in header for shop pages
  subscribeBar?: SubscribeBarSettings
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
  showSalesAnnouncement?: boolean // Show "X purchased this item" text
  showRatingNextToSeller?: boolean // Show stars next to seller name
  colors: ColorConfig
  spacing: SpacingConfig
  // Product page specific settings
  creatorBar?: ProductCreatorBarSettings
  stickyAddToCart?: StickyAddToCartSettings
}

// Creator bar settings for product pages (like Subscribe Bar but with creator name)
export interface ProductCreatorBarSettings {
  visible: boolean
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
export type ThemePreset = "default" | "air" | "astrid" | "royal" | "ocean" | "sunset" | "forest" | "rose" | "midnight"

// Verified badge type options
export type VerifiedBadgeType = "verified_creator" | "verified_brand" | "verified_business" | "official_page" | "verified_artist"

// Global store settings
export interface GlobalStoreSettings {
  // Basic Info
  storeName: string
  storeTagline?: string

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
