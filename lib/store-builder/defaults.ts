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
  AboutSettings,
  GlobalStoreSettings,
  ThemePreset,
  VerifiedBadgeType,
} from "./types"

// ============================================
// Theme Presets
// ============================================

export interface ThemeConfig {
  name: string
  description: string
  colors: {
    primary: string
    secondary: string
    accent: string
    background: string
    foreground: string
    muted: string
    border: string
  }
  borderRadius: number
  buttonBorderRadius: number
  // Profile image border color
  profileImageBorderColor: string
  // Component-specific overrides
  subscribeBar: {
    buttonColor: string
    buttonTextColor: string
    backgroundColor: string
    textColor: string
    buttonBorderRadius?: number
    inputBorderColor?: string
    inputTextColor?: string
    inputPlaceholderColor?: string
    inputBackgroundColor?: string
  }
  creatorBar: {
    backgroundColor: string
    textColor: string
    buttonColor: string
    buttonTextColor: string
    buttonBorderRadius: number
  }
  stickyAddToCart: {
    backgroundColor: string
    buttonColor: string
    buttonTextColor: string
    borderRadius: number
    textColor?: string
  }
  productHeader: {
    buyButtonColor: string
    buyButtonTextColor: string
    buttonsBorderRadius?: number
  }
  // Section-specific styling
  sections: {
    headerBackgroundColor: string
    headerTextColor: string
    featuredProductsBackgroundColor: string
    featuredProductsTextColor: string
    footerBackgroundColor: string
    footerTextColor: string
    pageBackgroundColor: string
  }
  // Product card styling (for Featured Products and More from Seller sections)
  productCard: {
    backgroundColor: string
    textColor: string
    priceColor: string
    borderColor: string
  }
  // Category filter styling
  categoryFilter: {
    textColor: string
    activeTextColor: string
    borderColor: string
  }
}

export const themePresets: Record<ThemePreset, ThemeConfig> = {
  default: {
    name: "Default",
    description: "Clean minimal white with subtle shadows",
    colors: {
      primary: "#e5e5e5",
      secondary: "#f5f5f5",
      accent: "#6b7280",
      background: "#ffffff",
      foreground: "#374151",
      muted: "#f9fafb",
      border: "#e5e7eb",
    },
    borderRadius: 8,
    buttonBorderRadius: 8,
    profileImageBorderColor: "#e5e7eb",
    subscribeBar: {
      buttonColor: "#6b7280",
      buttonTextColor: "#ffffff",
      backgroundColor: "#ffffff",
      textColor: "#374151",
      buttonBorderRadius: 8,
      inputBorderColor: "#e5e7eb",
      inputTextColor: "#374151",
      inputPlaceholderColor: "#9ca3af",
      inputBackgroundColor: "transparent",
    },
    creatorBar: {
      backgroundColor: "#f3f4f6",
      textColor: "#374151",
      buttonColor: "#6b7280",
      buttonTextColor: "#ffffff",
      buttonBorderRadius: 8,
    },
    stickyAddToCart: {
      backgroundColor: "#ffffff",
      buttonColor: "#374151",
      buttonTextColor: "#ffffff",
      borderRadius: 8,
    },
    productHeader: {
      buyButtonColor: "#374151",
      buyButtonTextColor: "#ffffff",
      buttonsBorderRadius: 8,
    },
    sections: {
      headerBackgroundColor: "transparent",
      headerTextColor: "#374151",
      featuredProductsBackgroundColor: "#ffffff",
      featuredProductsTextColor: "#374151",
      footerBackgroundColor: "#f9fafb",
      footerTextColor: "#6b7280",
      pageBackgroundColor: "#ffffff",
    },
    productCard: {
      backgroundColor: "#ffffff",
      textColor: "#374151",
      priceColor: "#6b7280",
      borderColor: "#e5e7eb",
    },
    categoryFilter: {
      textColor: "#6b7280",
      activeTextColor: "#374151",
      borderColor: "#374151",
    },
  },
  air: {
    name: "Air",
    description: "Sleek gradient with metallic finish",
    colors: {
      primary: "#1e293b",
      secondary: "#94a3b8",
      accent: "#3b82f6",
      background: "#f8fafc",
      foreground: "#0f172a",
      muted: "#f1f5f9",
      border: "#cbd5e1",
    },
    borderRadius: 12,
    buttonBorderRadius: 12,
    profileImageBorderColor: "#cbd5e1",
    subscribeBar: {
      buttonColor: "#1e293b",
      buttonTextColor: "#ffffff",
      backgroundColor: "linear-gradient(180deg, #ffffff 0%, #e2e8f0 100%)",
      textColor: "#0f172a",
      buttonBorderRadius: 12,
      inputBorderColor: "#cbd5e1",
      inputTextColor: "#0f172a",
      inputPlaceholderColor: "#64748b",
      inputBackgroundColor: "#ffffff",
    },
    creatorBar: {
      backgroundColor: "linear-gradient(180deg, #1e293b 0%, #334155 100%)",
      textColor: "#ffffff",
      buttonColor: "#475569",
      buttonTextColor: "#ffffff",
      buttonBorderRadius: 12,
    },
    stickyAddToCart: {
      backgroundColor: "#f8fafc",
      buttonColor: "#1e293b",
      buttonTextColor: "#ffffff",
      borderRadius: 12,
      textColor: "#0f172a",
    },
    productHeader: {
      buyButtonColor: "#1e293b",
      buyButtonTextColor: "#ffffff",
      buttonsBorderRadius: 12,
    },
    sections: {
      headerBackgroundColor: "transparent",
      headerTextColor: "#0f172a",
      featuredProductsBackgroundColor: "#f1f5f9",
      featuredProductsTextColor: "#0f172a",
      footerBackgroundColor: "#1e293b",
      footerTextColor: "#e2e8f0",
      pageBackgroundColor: "#f8fafc",
    },
    productCard: {
      backgroundColor: "#ffffff",
      textColor: "#0f172a",
      priceColor: "#475569",
      borderColor: "#cbd5e1",
    },
    categoryFilter: {
      textColor: "#64748b",
      activeTextColor: "#0f172a",
      borderColor: "#0f172a",
    },
  },
  astrid: {
    name: "Astrid",
    description: "Dark and elegant with premium feel",
    colors: {
      primary: "#404040",
      secondary: "#525252",
      accent: "#a855f7",
      background: "#0a0a0a",
      foreground: "#fafafa",
      muted: "#171717",
      border: "#262626",
    },
    borderRadius: 10,
    buttonBorderRadius: 10,
    profileImageBorderColor: "#404040",
    subscribeBar: {
      buttonColor: "#404040",
      buttonTextColor: "#ffffff",
      backgroundColor: "#0f0f0f",
      textColor: "#e5e5e5",
      buttonBorderRadius: 10,
      inputBorderColor: "#262626",
      inputTextColor: "#e5e5e5",
      inputPlaceholderColor: "#737373",
      inputBackgroundColor: "transparent",
    },
    creatorBar: {
      backgroundColor: "#141414",
      textColor: "#e5e5e5",
      buttonColor: "#404040",
      buttonTextColor: "#ffffff",
      buttonBorderRadius: 10,
    },
    stickyAddToCart: {
      backgroundColor: "#0f0f0f",
      buttonColor: "#404040",
      buttonTextColor: "#ffffff",
      borderRadius: 10,
      textColor: "#e5e5e5",
    },
    productHeader: {
      buyButtonColor: "#404040",
      buyButtonTextColor: "#ffffff",
      buttonsBorderRadius: 10,
    },
    sections: {
      headerBackgroundColor: "#0a0a0a",
      headerTextColor: "#fafafa",
      featuredProductsBackgroundColor: "#0f0f0f",
      featuredProductsTextColor: "#fafafa",
      footerBackgroundColor: "#0a0a0a",
      footerTextColor: "#a1a1aa",
      pageBackgroundColor: "#0a0a0a",
    },
    productCard: {
      backgroundColor: "#1a1a1a",
      textColor: "#fafafa",
      priceColor: "#a1a1aa",
      borderColor: "#2a2a2a",
    },
    categoryFilter: {
      textColor: "#a1a1aa",
      activeTextColor: "#fafafa",
      borderColor: "#fafafa",
    },
  },
  royal: {
    name: "Royal",
    description: "Vibrant purple gradient theme",
    colors: {
      primary: "#ffffff",
      secondary: "#e9d5ff",
      accent: "#a855f7",
      background: "#7c3aed",
      foreground: "#ffffff",
      muted: "rgba(255,255,255,0.15)",
      border: "rgba(255,255,255,0.2)",
    },
    borderRadius: 24,
    buttonBorderRadius: 24,
    profileImageBorderColor: "rgba(255,255,255,0.4)",
    subscribeBar: {
      buttonColor: "#ffffff",
      buttonTextColor: "#7c3aed",
      backgroundColor: "linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #c084fc 100%)",
      textColor: "#ffffff",
      buttonBorderRadius: 24,
      inputBorderColor: "rgba(255,255,255,0.3)",
      inputTextColor: "#ffffff",
      inputPlaceholderColor: "rgba(255,255,255,0.7)",
      inputBackgroundColor: "transparent",
    },
    creatorBar: {
      backgroundColor: "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)",
      textColor: "#ffffff",
      buttonColor: "#ffffff",
      buttonTextColor: "#7c3aed",
      buttonBorderRadius: 24,
    },
    stickyAddToCart: {
      backgroundColor: "#8b5cf6",
      buttonColor: "#ffffff",
      buttonTextColor: "#7c3aed",
      borderRadius: 24,
      textColor: "#ffffff",
    },
    productHeader: {
      buyButtonColor: "#ffffff",
      buyButtonTextColor: "#7c3aed",
      buttonsBorderRadius: 24,
    },
    sections: {
      headerBackgroundColor: "transparent",
      headerTextColor: "#ffffff",
      featuredProductsBackgroundColor: "#8b5cf6",
      featuredProductsTextColor: "#ffffff",
      footerBackgroundColor: "#6d28d9",
      footerTextColor: "#e9d5ff",
      pageBackgroundColor: "#7c3aed",
    },
    productCard: {
      backgroundColor: "rgba(255, 255, 255, 0.15)",
      textColor: "#ffffff",
      priceColor: "#e9d5ff",
      borderColor: "rgba(255, 255, 255, 0.2)",
    },
    categoryFilter: {
      textColor: "#e9d5ff",
      activeTextColor: "#ffffff",
      borderColor: "#ffffff",
    },
  },
  ocean: {
    name: "Ocean",
    description: "Deep blue gradient with teal accents",
    colors: {
      primary: "#ffffff",
      secondary: "#bae6fd",
      accent: "#0ea5e9",
      background: "#0369a1",
      foreground: "#ffffff",
      muted: "rgba(255,255,255,0.15)",
      border: "rgba(255,255,255,0.2)",
    },
    borderRadius: 20,
    buttonBorderRadius: 20,
    profileImageBorderColor: "rgba(255,255,255,0.4)",
    subscribeBar: {
      buttonColor: "#0ea5e9",
      buttonTextColor: "#ffffff",
      backgroundColor: "linear-gradient(135deg, #0369a1 0%, #0891b2 50%, #14b8a6 100%)",
      textColor: "#ffffff",
      buttonBorderRadius: 20,
      inputBorderColor: "rgba(255,255,255,0.3)",
      inputTextColor: "#ffffff",
      inputPlaceholderColor: "rgba(255,255,255,0.7)",
      inputBackgroundColor: "transparent",
    },
    creatorBar: {
      backgroundColor: "linear-gradient(135deg, #0369a1 0%, #0891b2 100%)",
      textColor: "#ffffff",
      buttonColor: "#0ea5e9",
      buttonTextColor: "#ffffff",
      buttonBorderRadius: 20,
    },
    stickyAddToCart: {
      backgroundColor: "#0891b2",
      buttonColor: "#ffffff",
      buttonTextColor: "#0891b2",
      borderRadius: 20,
      textColor: "#ffffff",
    },
    productHeader: {
      buyButtonColor: "#0ea5e9",
      buyButtonTextColor: "#ffffff",
      buttonsBorderRadius: 20,
    },
    sections: {
      headerBackgroundColor: "transparent",
      headerTextColor: "#ffffff",
      featuredProductsBackgroundColor: "#0891b2",
      featuredProductsTextColor: "#ffffff",
      footerBackgroundColor: "#065986",
      footerTextColor: "#bae6fd",
      pageBackgroundColor: "#0369a1",
    },
    productCard: {
      backgroundColor: "rgba(255, 255, 255, 0.15)",
      textColor: "#ffffff",
      priceColor: "#bae6fd",
      borderColor: "rgba(255, 255, 255, 0.2)",
    },
    categoryFilter: {
      textColor: "#bae6fd",
      activeTextColor: "#ffffff",
      borderColor: "#ffffff",
    },
  },
  sunset: {
    name: "Sunset",
    description: "Warm orange to pink gradient",
    colors: {
      primary: "#ffffff",
      secondary: "#fecdd3",
      accent: "#f97316",
      background: "#f97316",
      foreground: "#ffffff",
      muted: "rgba(255,255,255,0.15)",
      border: "rgba(255,255,255,0.2)",
    },
    borderRadius: 20,
    buttonBorderRadius: 20,
    profileImageBorderColor: "rgba(255,255,255,0.4)",
    subscribeBar: {
      buttonColor: "#ffffff",
      buttonTextColor: "#f97316",
      backgroundColor: "linear-gradient(135deg, #f97316 0%, #fb923c 30%, #ec4899 100%)",
      textColor: "#ffffff",
      buttonBorderRadius: 20,
      inputBorderColor: "rgba(255,255,255,0.3)",
      inputTextColor: "#ffffff",
      inputPlaceholderColor: "rgba(255,255,255,0.7)",
      inputBackgroundColor: "transparent",
    },
    creatorBar: {
      backgroundColor: "linear-gradient(135deg, #f97316 0%, #fb923c 100%)",
      textColor: "#ffffff",
      buttonColor: "#ffffff",
      buttonTextColor: "#f97316",
      buttonBorderRadius: 20,
    },
    stickyAddToCart: {
      backgroundColor: "#fb923c",
      buttonColor: "#ffffff",
      buttonTextColor: "#f97316",
      borderRadius: 20,
      textColor: "#ffffff",
    },
    productHeader: {
      buyButtonColor: "#ffffff",
      buyButtonTextColor: "#f97316",
      buttonsBorderRadius: 20,
    },
    sections: {
      headerBackgroundColor: "transparent",
      headerTextColor: "#ffffff",
      featuredProductsBackgroundColor: "#fb923c",
      featuredProductsTextColor: "#ffffff",
      footerBackgroundColor: "#ec4899",
      footerTextColor: "#fecdd3",
      pageBackgroundColor: "#f97316",
    },
    productCard: {
      backgroundColor: "rgba(255, 255, 255, 0.15)",
      textColor: "#ffffff",
      priceColor: "#fecdd3",
      borderColor: "rgba(255, 255, 255, 0.2)",
    },
    categoryFilter: {
      textColor: "#fecdd3",
      activeTextColor: "#ffffff",
      borderColor: "#ffffff",
    },
  },
  forest: {
    name: "Forest",
    description: "Fresh green nature theme",
    colors: {
      primary: "#ffffff",
      secondary: "#bbf7d0",
      accent: "#22c55e",
      background: "#166534",
      foreground: "#ffffff",
      muted: "rgba(255,255,255,0.15)",
      border: "rgba(255,255,255,0.2)",
    },
    borderRadius: 16,
    buttonBorderRadius: 16,
    profileImageBorderColor: "rgba(255,255,255,0.4)",
    subscribeBar: {
      buttonColor: "#ffffff",
      buttonTextColor: "#166534",
      backgroundColor: "linear-gradient(135deg, #166534 0%, #22c55e 50%, #4ade80 100%)",
      textColor: "#ffffff",
      buttonBorderRadius: 16,
      inputBorderColor: "rgba(255,255,255,0.3)",
      inputTextColor: "#ffffff",
      inputPlaceholderColor: "rgba(255,255,255,0.7)",
      inputBackgroundColor: "transparent",
    },
    creatorBar: {
      backgroundColor: "linear-gradient(135deg, #166534 0%, #22c55e 100%)",
      textColor: "#ffffff",
      buttonColor: "#ffffff",
      buttonTextColor: "#166534",
      buttonBorderRadius: 16,
    },
    stickyAddToCart: {
      backgroundColor: "#22c55e",
      buttonColor: "#ffffff",
      buttonTextColor: "#166534",
      borderRadius: 16,
      textColor: "#ffffff",
    },
    productHeader: {
      buyButtonColor: "#22c55e",
      buyButtonTextColor: "#ffffff",
      buttonsBorderRadius: 16,
    },
    sections: {
      headerBackgroundColor: "transparent",
      headerTextColor: "#ffffff",
      featuredProductsBackgroundColor: "#15803d",
      featuredProductsTextColor: "#ffffff",
      footerBackgroundColor: "#14532d",
      footerTextColor: "#bbf7d0",
      pageBackgroundColor: "#166534",
    },
    productCard: {
      backgroundColor: "rgba(255, 255, 255, 0.15)",
      textColor: "#ffffff",
      priceColor: "#bbf7d0",
      borderColor: "rgba(255, 255, 255, 0.2)",
    },
    categoryFilter: {
      textColor: "#bbf7d0",
      activeTextColor: "#ffffff",
      borderColor: "#ffffff",
    },
  },
  rose: {
    name: "Rose",
    description: "Elegant pink and rose theme",
    colors: {
      primary: "#ffffff",
      secondary: "#fce7f3",
      accent: "#ec4899",
      background: "#be185d",
      foreground: "#ffffff",
      muted: "rgba(255,255,255,0.15)",
      border: "rgba(255,255,255,0.2)",
    },
    borderRadius: 24,
    buttonBorderRadius: 24,
    profileImageBorderColor: "rgba(255,255,255,0.4)",
    subscribeBar: {
      buttonColor: "#ffffff",
      buttonTextColor: "#be185d",
      backgroundColor: "linear-gradient(135deg, #be185d 0%, #ec4899 50%, #f472b6 100%)",
      textColor: "#ffffff",
      buttonBorderRadius: 24,
      inputBorderColor: "rgba(255,255,255,0.3)",
      inputTextColor: "#ffffff",
      inputPlaceholderColor: "rgba(255,255,255,0.7)",
      inputBackgroundColor: "transparent",
    },
    creatorBar: {
      backgroundColor: "linear-gradient(135deg, #be185d 0%, #ec4899 100%)",
      textColor: "#ffffff",
      buttonColor: "#ffffff",
      buttonTextColor: "#be185d",
      buttonBorderRadius: 24,
    },
    stickyAddToCart: {
      backgroundColor: "#ec4899",
      buttonColor: "#ffffff",
      buttonTextColor: "#be185d",
      borderRadius: 24,
      textColor: "#ffffff",
    },
    productHeader: {
      buyButtonColor: "#ec4899",
      buyButtonTextColor: "#ffffff",
      buttonsBorderRadius: 24,
    },
    sections: {
      headerBackgroundColor: "transparent",
      headerTextColor: "#ffffff",
      featuredProductsBackgroundColor: "#db2777",
      featuredProductsTextColor: "#ffffff",
      footerBackgroundColor: "#9d174d",
      footerTextColor: "#fce7f3",
      pageBackgroundColor: "#be185d",
    },
    productCard: {
      backgroundColor: "rgba(255, 255, 255, 0.15)",
      textColor: "#ffffff",
      priceColor: "#fce7f3",
      borderColor: "rgba(255, 255, 255, 0.2)",
    },
    categoryFilter: {
      textColor: "#fce7f3",
      activeTextColor: "#ffffff",
      borderColor: "#ffffff",
    },
  },
  midnight: {
    name: "Midnight",
    description: "Deep dark blue premium theme",
    colors: {
      primary: "#334155",
      secondary: "#475569",
      accent: "#3b82f6",
      background: "#0f172a",
      foreground: "#f8fafc",
      muted: "#1e293b",
      border: "#334155",
    },
    borderRadius: 12,
    buttonBorderRadius: 12,
    profileImageBorderColor: "#475569",
    subscribeBar: {
      buttonColor: "#3b82f6",
      buttonTextColor: "#ffffff",
      backgroundColor: "#1e293b",
      textColor: "#f8fafc",
      buttonBorderRadius: 12,
      inputBorderColor: "#334155",
      inputTextColor: "#f8fafc",
      inputPlaceholderColor: "#94a3b8",
      inputBackgroundColor: "transparent",
    },
    creatorBar: {
      backgroundColor: "#1a2439",
      textColor: "#f8fafc",
      buttonColor: "#3b82f6",
      buttonTextColor: "#ffffff",
      buttonBorderRadius: 12,
    },
    stickyAddToCart: {
      backgroundColor: "#1e293b",
      buttonColor: "#3b82f6",
      buttonTextColor: "#ffffff",
      borderRadius: 12,
      textColor: "#f8fafc",
    },
    productHeader: {
      buyButtonColor: "#3b82f6",
      buyButtonTextColor: "#ffffff",
      buttonsBorderRadius: 12,
    },
    sections: {
      headerBackgroundColor: "#0f172a",
      headerTextColor: "#f8fafc",
      featuredProductsBackgroundColor: "#182033",
      featuredProductsTextColor: "#f8fafc",
      footerBackgroundColor: "#0f172a",
      footerTextColor: "#94a3b8",
      pageBackgroundColor: "#0f172a",
    },
    productCard: {
      backgroundColor: "#253349",
      textColor: "#f8fafc",
      priceColor: "#94a3b8",
      borderColor: "#3d4f6a",
    },
    categoryFilter: {
      textColor: "#94a3b8",
      activeTextColor: "#f8fafc",
      borderColor: "#f8fafc",
    },
  },
}

// Verified badge type labels
export const verifiedBadgeLabels: Record<VerifiedBadgeType, string> = {
  verified_creator: "Verified Creator",
  verified_brand: "Verified Brand",
  verified_business: "Verified Business",
  official_page: "Official Page",
  verified_artist: "Verified Artist",
}

// Default global store settings
export const defaultGlobalStoreSettings: GlobalStoreSettings = {
  storeName: "",
  storeTagline: "",
  seoTitle: "",
  seoDescription: "",
  socialImageUrl: "",
  verifiedBadgeEnabled: false,
  verifiedBadgeType: "verified_creator",
  themePreset: "default",
}

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
  buttonBorderRadius: 8,
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
  buttonBorderRadius: 8, // Default border radius
  inputBorderColor: "#e5e7eb", // Default input border color
  inputTextColor: "#374151", // Default input text color
  inputPlaceholderColor: "#9ca3af", // Default placeholder color
  inputBackgroundColor: "transparent", // Default input background
  showAvatar: true,
  position: "top",
  style: "style1",
  enableStickyBar: false, // Sticky disabled by default
  enableStickyOnScrollUp: false, // Sticky on scroll up disabled by default
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
  profileImageBorderColor: undefined, // Controlled by theme preset by default
  showHeadline: true,
  showBio: true,
  showNicheTags: true,
  showStats: true,
  showTotalSalesBadge: true,
  showSocialMedia: false,
  showSocialIconsOnMobile: true, // Added default for mobile social icons toggle
  socialMediaIconColor: "#ffffff",
  socialMediaIconStyle: "default",
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
  body: "Discover my amazing collection of digital products, crafted with care.",
  imageUrl: "",
  imagePosition: "right",
  buttonText: "Browse Products",
  buttonUrl: "#products",
  showButton: true,
  buttonLinkType: "custom",
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
  headline: "",
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
  // Carousel settings
  enableCarousel: false,
  autoplay: false,
  autoplaySpeed: 4000,
  // Gap settings
  horizontalGap: 24,
  verticalGap: 24,
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

export const defaultAboutSettings: AboutSettings = {
  visible: true,
  sellerName: "",
  headline: "",
  aboutContent: "",
  mediaItems: [],
  showSalesStats: true,
  memberSince: undefined,
  totalSales: undefined,
  maxContentHeight: 150,
  showPaymentMethods: true,
  paymentMethods: ["paypal", "visa", "mastercard", "amex", "applepay", "googlepay"],
  spacing: {
    paddingTop: 48,
    paddingBottom: 48,
    paddingLeft: 0,
    paddingRight: 0,
  },
  mobileSpacing: {
    paddingTop: 24,
    paddingBottom: 24,
    paddingLeft: 0,
    paddingRight: 0,
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
  // Note: "more-from-seller" is NOT in the section library - it's only added automatically to product pages
  // and cannot be manually added via the Add Section popup
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
  sections: [
    {
      id: generateSectionId(),
      type: "about",
      settings: defaultAboutSettings,
      order: 0,
      locked: true, // Locked so it can only be hidden, not deleted
    },
  ],
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
      locked: true, // Locked so it can only be hidden, not deleted
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
  small: 110,
  medium: 137, // kept for backwards compatibility
  large: 137, // same as medium
}
