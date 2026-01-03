import type {
  PageConfig,
  Section,
  SectionLibraryItem,
  ShopHeaderSettings,
  ProductHeaderSettings,
  ImageTextSettings,
  BenefitsSettings,
  TextBlockSettings,
  AnnouncementBarSettings,
  FeaturedProductsSettings,
  MoreFromSellerSettings,
  SubscribeBarSettings,
  AvatarSizeChoice,
  ProductCreatorBarSettings,
  StickyAddToCartSettings,
  ReviewsSettings,
} from "./types"

// Button text presets for subscribe bar
export const subscribeBarButtonPresets = {
  subscribe: "Subscribe",
  get_now: "Get Now",
  grab_it: "Grab It",
  download: "Download",
  buy_now: "Buy Now",
  join_now: "Join Now",
  sign_up: "Sign Up",
  custom: "Custom",
} as const

// Button text presets for sticky add to cart
export const stickyAddToCartButtonPresets = {
  add_to_cart: "Add to cart",
  grab_it: "Grab It",
  grab_me: "Grab Me",
  download: "Download",
  get_it: "Get It!",
} as const

// Default product creator bar settings (like subscribe bar with button)
export const defaultProductCreatorBarSettings: ProductCreatorBarSettings = {
  visible: true,
  backgroundColor: "#1a1a1a",
  textColor: "#ffffff",
  buttonColor: "#4b5563",
  buttonTextColor: "#ffffff",
  buttonStyle: "style4", // Follow
}

// Default sticky add to cart settings
export const defaultStickyAddToCartSettings: StickyAddToCartSettings = {
  visible: true,
  backgroundColor: "#ffffff",
  buttonColor: "#2563eb", // Blue
  buttonTextColor: "#ffffff",
  buttonStyle: "add_to_cart",
  borderRadius: 8,
}

export const defaultSubscribeBarSettings: SubscribeBarSettings = {
  visible: true,
  text: "", // ✅ important
  customCtaText: "", // added customCtaText to defaults
  placeholder: "Enter your email",
  buttonText: "Subscribe",
  buttonTextPreset: "subscribe",
  customButtonText: "",
  buttonColor: "#2563eb", // Blue
  buttonTextColor: "#ffffff", // White
  showAvatar: true,
  position: "top",
  style: "style1",
  enableStickyBar: false, // Sticky disabled by default
  buttonStyle: "style1", // Default button style
  spacing: {
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 16,
    paddingRight: 16,
  },
  mobileSpacing: {
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 12,
    paddingRight: 12,
  },
  colors: {
    backgroundColor: "#ffffff",
    textColor: "#000000",
    accentColor: "#2563eb",
  },
  typography: {
    fontSize: 14,
    fontWeight: "medium",
    textAlign: "center",
  },
}

// Default header settings for shop page
export const defaultShopHeaderSettings: ShopHeaderSettings = {
  coverImageUrl: undefined,
  coverFocalPoint: { x: 50, y: 50 },
  coverBrightness: 1.0, // Added default cover brightness (1.0 = normal)
  avatarUrl: undefined, // Avatar URL, empty string means show initials placeholder
  avatarSize: 137, // desktop px (legacy default)
  mobileAvatarSize: 137, // mobile px (legacy default)
  avatarSizeChoice: "medium",
  mobileAvatarSizeChoice: "medium",
  showHeadline: true,
  showBio: true,
  showNicheTags: true,
  showStats: true,
  showTotalSalesBadge: true,
  showSocialMedia: false,
  showSocialIconsOnMobile: true, // Added default for mobile social icons toggle
  socialMediaIconColor: "#ffffff",
  socialLinks: {
    instagram: { enabled: true, url: "" },
    tiktok: { enabled: true, url: "" },
    youtube: { enabled: true, url: "" },
    twitter: { enabled: true, url: "" },
    spotify: { enabled: false, url: "" },
  },
  faviconUrl: undefined,
  colors: {
    backgroundColor: "transparent",
    textColor: "",
    accentColor: "",
  },
  spacing: {
    paddingTop: 32,
    paddingBottom: 32,
  },
  subscribeBar: defaultSubscribeBarSettings,
}

// Default header settings for product page
export const defaultProductHeaderSettings: ProductHeaderSettings = {
  showGallery: true,
  showBadges: true,
  showCreatorInfo: true,
  showWhatsIncluded: true,
  colors: {
    backgroundColor: "transparent",
    textColor: "",
    accentColor: "",
  },
  spacing: {
    paddingTop: 24,
    paddingBottom: 24,
  },
  creatorBar: defaultProductCreatorBarSettings,
  stickyAddToCart: defaultStickyAddToCartSettings,
}

// Default section settings
export const defaultImageTextSettings: ImageTextSettings = {
  visible: true,
  headline: "Welcome to my store",
  body: "Discover amazing digital products crafted with care.",
  imageUrl: "",
  imagePosition: "right",
  buttonText: "Browse Products",
  buttonUrl: "#products",
  showButton: true,
  spacing: {
    paddingTop: 48,
    paddingBottom: 48,
    paddingLeft: 16,
    paddingRight: 16,
  },
  mobileSpacing: {
    paddingTop: 24,
    paddingBottom: 24,
    paddingLeft: 12,
    paddingRight: 12,
  },
  colors: {
    backgroundColor: "transparent",
    textColor: "",
    accentColor: "",
  },
  typography: {
    fontSize: 16,
    fontWeight: "normal",
    textAlign: "left",
  },
}

export const defaultBenefitsSettings: BenefitsSettings = {
  visible: true,
  headline: "Why choose us",
  benefits: [
    {
      id: "1",
      icon: "check-circle",
      title: "High Quality",
      description: "Premium content created by experts",
    },
    {
      id: "2",
      icon: "zap",
      title: "Instant Access",
      description: "Download immediately after purchase",
    },
    {
      id: "3",
      icon: "shield",
      title: "Secure Payments",
      description: "Your payment info is always protected",
    },
  ],
  columns: 3,
  spacing: {
    paddingTop: 48,
    paddingBottom: 48,
    paddingLeft: 16,
    paddingRight: 16,
  },
  mobileSpacing: {
    paddingTop: 24,
    paddingBottom: 24,
    paddingLeft: 12,
    paddingRight: 12,
  },
  colors: {
    backgroundColor: "",
    textColor: "",
    accentColor: "",
  },
  typography: {
    fontSize: 16,
    fontWeight: "normal",
    textAlign: "center",
  },
}

export const defaultTextBlockSettings: TextBlockSettings = {
  visible: true,
  headline: "",
  body: "Add your content here. You can write about your story, your mission, or anything else you want to share with your customers.",
  maxWidth: "md",
  spacing: {
    paddingTop: 32,
    paddingBottom: 32,
    paddingLeft: 16,
    paddingRight: 16,
  },
  mobileSpacing: {
    paddingTop: 16,
    paddingBottom: 16,
    paddingLeft: 12,
    paddingRight: 12,
  },
  colors: {
    backgroundColor: "transparent",
    textColor: "",
    accentColor: "",
  },
  typography: {
    fontSize: 16,
    fontWeight: "normal",
    textAlign: "left",
    lineHeight: 1.6,
  },
}

export const defaultAnnouncementBarSettings: AnnouncementBarSettings = {
  visible: true,
  text: "New products available! Check them out.",
  linkText: "Shop now",
  linkUrl: "#products",
  dismissible: true,
  textSize: 14, // Added default textSize
  enableUnderline: false, // Added enableUnderline default
  spacing: {
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 16,
    paddingRight: 16,
  },
  mobileSpacing: {
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 10,
    paddingRight: 10,
  },
  colors: {
    backgroundColor: "#000000",
    textColor: "#ffffff",
    accentColor: "#ffffff",
  },
  typography: {
    fontSize: 14,
    fontWeight: "medium",
    textAlign: "center",
  },
}

export const defaultFeaturedProductsSettings: FeaturedProductsSettings = {
  visible: true,
  headline: "Featured Products",
  productIds: [],

  // NEW (default)
  mobileListing: 1,

  // columns/maxProducts removed from defaults (unlimited by default)
  showPrice: true,
  showCompareAtPrice: false,
  hideCategoryFilter: false,
  spacing: {
    paddingTop: 48,
    paddingBottom: 48,
    paddingLeft: 16,
    paddingRight: 16,
  },
  mobileSpacing: {
    paddingTop: 24,
    paddingBottom: 24,
    paddingLeft: 12,
    paddingRight: 12,
  },
  colors: {
    backgroundColor: "transparent",
    textColor: "",
    accentColor: "",
  },
  typography: {
    fontSize: 24,
    fontWeight: "semibold",
    textAlign: "left",
  },
}

export const defaultMoreFromSellerSettings: MoreFromSellerSettings = {
  visible: true,
  headline: "More from",
  columns: 4,
  maxProducts: 4,
  showPrice: true,
  showCompareAtPrice: false,
  showDescription: false,
  mobileProductsPerRow: 1,
  spacing: {
    paddingTop: 48,
    paddingBottom: 48,
    paddingLeft: 16,
    paddingRight: 16,
  },
  mobileSpacing: {
    paddingTop: 24,
    paddingBottom: 24,
    paddingLeft: 5,
    paddingRight: 5,
  },
  colors: {
    backgroundColor: "transparent",
    textColor: "",
    accentColor: "",
  },
  typography: {
    fontSize: 20,
    fontWeight: "semibold",
    textAlign: "left",
  },
}

export const defaultReviewsSettings: ReviewsSettings = {
  visible: true,
  headline: "Customer Reviews",
  showAverageRating: true,
  showReviewCount: true,
  showStarRatings: true,
  maxReviewsToShow: 10,
  spacing: {
    paddingTop: 48,
    paddingBottom: 48,
    paddingLeft: 16,
    paddingRight: 16,
  },
  mobileSpacing: {
    paddingTop: 24,
    paddingBottom: 24,
    paddingLeft: 12,
    paddingRight: 12,
  },
  colors: {
    backgroundColor: "transparent",
    textColor: "",
    accentColor: "",
  },
  typography: {
    fontSize: 20,
    fontWeight: "semibold",
    textAlign: "left",
  },
}

// Section library for adding new sections
export const sectionLibrary: SectionLibraryItem[] = [
  {
    type: "image-text",
    name: "Image + Text",
    description: "Side-by-side image and text content",
    icon: "layout",
    defaultSettings: defaultImageTextSettings,
  },
  {
    type: "benefits",
    name: "Benefits",
    description: "Icon list highlighting features",
    icon: "list-checks",
    defaultSettings: defaultBenefitsSettings,
  },
  {
    type: "text-block",
    name: "Text Block",
    description: "Rich text paragraph section",
    icon: "type",
    defaultSettings: defaultTextBlockSettings,
  },
  {
    type: "announcement-bar",
    name: "Announcement Bar",
    description: "Promotional banner message",
    icon: "megaphone",
    defaultSettings: defaultAnnouncementBarSettings,
  },
  {
    type: "featured-products",
    name: "Featured Products",
    description: "Showcase selected products",
    icon: "grid",
    defaultSettings: defaultFeaturedProductsSettings,
  },
  {
    type: "more-from-seller",
    name: "More from Seller",
    description: "More products from the same seller",
    icon: "storefront",
    defaultSettings: defaultMoreFromSellerSettings,
  },
  {
    type: "reviews",
    name: "Reviews",
    description: "Customer reviews and ratings",
    icon: "star",
    defaultSettings: defaultReviewsSettings,
  },
]

// Default shop page config
export const defaultShopPageConfig: PageConfig = {
  pageType: "shop",
  headerSettings: defaultShopHeaderSettings,
  sections: [],
  version: 1,
}

// Default product page config
export const defaultProductPageConfig: PageConfig = {
  pageType: "product",
  headerSettings: defaultProductHeaderSettings,
  sections: [
    {
      id: generateSectionId(),
      type: "reviews",
      settings: defaultReviewsSettings,
      order: 0,
      locked: true, // Locked so it can't be deleted
    },
    {
      id: generateSectionId(),
      type: "more-from-seller",
      settings: defaultMoreFromSellerSettings,
      order: 1,
      locked: false,
    },
  ],
  version: 1,
}

// Generate unique section ID
export function generateSectionId(): string {
  return `section_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Create a new section from library item
export function createSectionFromLibrary(libraryItem: SectionLibraryItem, order: number): Section {
  return {
    id: generateSectionId(),
    type: libraryItem.type,
    settings: { ...libraryItem.defaultSettings },
    order,
    locked: false,
  }
}

export const avatarSizeMap: Record<AvatarSizeChoice, number> = {
  small: 120,
  medium: 137,
  large: 144,
}
