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
  FAQSettings,
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
  // Reviews section styling
  reviewsSection: {
    backgroundColor: string
    textColor: string
    starColor: string
    cardBackgroundColor: string
    cardBorderColor: string
  }
  // FAQ section styling
  faqSection: {
    textColor: string
    borderColor: string
    iconColor: string
  }
  // Price container styling (product page sidebar)
  priceContainer: {
    backgroundColor: string
    textColor: string
    mutedTextColor: string
    borderColor: string
    iconColor: string
  }
  // View in Library button styling
  viewInLibraryButton: {
    backgroundColor: string
    textColor: string
    borderColor: string
  }
  // Announcement Bar styling
  announcementBar: {
    backgroundColor: string
    textColor: string
  }
  // Text Block styling
  textBlock: {
    backgroundColor: string
    headlineColor: string
    contentColor: string
  }
  // Benefits section styling
  benefits: {
    backgroundColor: string
    textColor: string
    iconColor: string
  }
  // Image + Text section styling
  imageText: {
    backgroundColor: string
    textColor: string
    buttonColor: string
    buttonTextColor: string
  }
  // About section styling
  about: {
    backgroundColor: string
    textColor: string
    mutedTextColor: string
  }
  // Wishlist button styling
  wishlistButton: {
    backgroundColor: string
    textColor: string
    borderColor: string
  }
}

export const themePresets: Record<ThemePreset, ThemeConfig> = {
  default: {
    name: "Default",
    description: "Clean minimal white with blue buttons",
    colors: {
      primary: "#2563eb", // Blue primary
      secondary: "#f5f5f5",
      accent: "#2563eb", // Blue accent
      background: "#ffffff",
      foreground: "#000000", // Black text
      muted: "#f9fafb",
      border: "#e5e7eb",
    },
    borderRadius: 8,
    buttonBorderRadius: 8,
    profileImageBorderColor: "#e5e7eb",
    subscribeBar: {
      buttonColor: "#2563eb", // Blue button
      buttonTextColor: "#ffffff", // White button text
      backgroundColor: "#ffffff", // White background
      textColor: "#000000", // Black text
      buttonBorderRadius: 8,
      inputBorderColor: "#e5e7eb",
      inputTextColor: "#000000", // Black input text
      inputPlaceholderColor: "#9ca3af",
      inputBackgroundColor: "transparent",
    },
    creatorBar: {
      backgroundColor: "#ffffff", // White background
      textColor: "#000000", // Black text
      buttonColor: "#2563eb", // Blue button
      buttonTextColor: "#ffffff", // White button text
      buttonBorderRadius: 8,
    },
    stickyAddToCart: {
      backgroundColor: "#ffffff",
      buttonColor: "#2563eb", // Blue button
      buttonTextColor: "#ffffff",
      borderRadius: 8,
      textColor: "#000000", // Black text for price
    },
    productHeader: {
      buyButtonColor: "#2563eb", // Blue buy button
      buyButtonTextColor: "#ffffff",
      buttonsBorderRadius: 8,
    },
    sections: {
      headerBackgroundColor: "#ffffff", // White header background
      headerTextColor: "#000000", // Black header text
      featuredProductsBackgroundColor: "#ffffff", // White background
      featuredProductsTextColor: "#2d3034", // Dark text as specified
      footerBackgroundColor: "#f9fafb",
      footerTextColor: "#6b7280",
      pageBackgroundColor: "#ffffff",
    },
    productCard: {
      backgroundColor: "#ffffff",
      textColor: "#2d3034", // Dark text
      priceColor: "#000000", // Black price
      borderColor: "#e5e7eb",
    },
    categoryFilter: {
      textColor: "#6b7280",
      activeTextColor: "#000000", // Black active text
      borderColor: "#000000",
    },
    reviewsSection: {
      backgroundColor: "#ffffff", // White background
      textColor: "#000000", // Black text
      starColor: "#000000", // Black stars
      cardBackgroundColor: "#ffffff",
      cardBorderColor: "#e5e7eb",
    },
    faqSection: {
      textColor: "#000000", // Black text
      borderColor: "#e5e7eb",
      iconColor: "#000000", // Black icons
    },
    priceContainer: {
      backgroundColor: "#ffffff",
      textColor: "#000000", // Black text
      mutedTextColor: "#6b7280",
      borderColor: "#e5e7eb",
      iconColor: "#000000", // Black icons to match text color
    },
    viewInLibraryButton: {
      backgroundColor: "transparent",
      textColor: "#000000", // Black text
      borderColor: "#e5e7eb",
    },
    announcementBar: {
      backgroundColor: "#f7f7f7", // Light gray background as specified
      textColor: "#000000", // Black text
    },
    textBlock: {
      backgroundColor: "#ffffff", // White background
      headlineColor: "#000000", // Black headline
      contentColor: "#4b5563", // Dark gray content
    },
    benefits: {
      backgroundColor: "#ffffff", // White background
      textColor: "#000000", // Black text
      iconColor: "#2563eb", // Blue icons
    },
    imageText: {
      backgroundColor: "#ffffff", // White background
      textColor: "#000000", // Black text
      buttonColor: "#2563eb", // Blue button
      buttonTextColor: "#ffffff", // White button text
    },
    about: {
      backgroundColor: "#ffffff", // White background
      textColor: "#000000", // Black text
      mutedTextColor: "#6b7280", // Gray muted text
    },
    wishlistButton: {
      backgroundColor: "transparent",
      textColor: "#000000",
      borderColor: "#e5e7eb",
    },
  },
  air: {
    name: "Air",
    description: "Sleek light UI with dark accents",
    colors: {
      primary: "#384252",
      secondary: "#94a3b8",
      accent: "#384252",
      background: "#ffffff",
      foreground: "#000000",
      muted: "#f8fafc",
      border: "#e5e7eb",
    },
    borderRadius: 8,
    buttonBorderRadius: 8,
    profileImageBorderColor: "#e5e7eb",
    subscribeBar: {
      buttonColor: "#384252",
      buttonTextColor: "#ffffff",
      backgroundColor: "#ffffff",
      textColor: "#000000",
      buttonBorderRadius: 8,
      inputBorderColor: "#e5e7eb",
      inputTextColor: "#000000",
      inputPlaceholderColor: "#9ca3af",
      inputBackgroundColor: "#ffffff",
    },
    creatorBar: {
      backgroundColor: "#232e3e",
      textColor: "#ffffff",
      buttonColor: "#ffffff",
      buttonTextColor: "#000000",
      buttonBorderRadius: 8,
    },
    stickyAddToCart: {
      backgroundColor: "#ffffff",
      buttonColor: "#384252",
      buttonTextColor: "#ffffff",
      borderRadius: 8,
      textColor: "#000000",
    },
    productHeader: {
      buyButtonColor: "#384252",
      buyButtonTextColor: "#ffffff",
      buttonsBorderRadius: 8,
    },
    sections: {
      headerBackgroundColor: "#ffffff",
      headerTextColor: "#000000",
      featuredProductsBackgroundColor: "#f8fafc",
      featuredProductsTextColor: "#000000",
      footerBackgroundColor: "#f8fafc",
      footerTextColor: "#6b7280",
      pageBackgroundColor: "#ffffff",
    },
    productCard: {
      backgroundColor: "#ffffff",
      textColor: "#000000",
      priceColor: "#6b7280",
      borderColor: "#e5e7eb",
    },
    categoryFilter: {
      textColor: "#6b7280",
      activeTextColor: "#000000",
      borderColor: "#000000",
    },
    reviewsSection: {
      backgroundColor: "#ffffff",
      textColor: "#000000",
      starColor: "#000000",
      cardBackgroundColor: "#ffffff",
      cardBorderColor: "#e5e7eb",
    },
    faqSection: {
      textColor: "#000000",
      borderColor: "#e5e7eb",
      iconColor: "#000000",
    },
    priceContainer: {
      backgroundColor: "#ffffff",
      textColor: "#000000",
      mutedTextColor: "#6b7280",
      borderColor: "#e5e7eb",
      iconColor: "#000000",
    },
    viewInLibraryButton: {
      backgroundColor: "transparent",
      textColor: "#000000",
      borderColor: "#e5e7eb",
    },
    announcementBar: {
      backgroundColor: "#f7f7f7",
      textColor: "#000000",
    },
    textBlock: {
      backgroundColor: "#ffffff",
      headlineColor: "#000000",
      contentColor: "#4b5563",
    },
    benefits: {
      backgroundColor: "#ffffff",
      textColor: "#000000",
      iconColor: "#384252",
    },
    imageText: {
      backgroundColor: "#ffffff",
      textColor: "#000000",
      buttonColor: "#384252",
      buttonTextColor: "#ffffff",
    },
    about: {
      backgroundColor: "#ffffff",
      textColor: "#000000",
      mutedTextColor: "#6b7280",
    },
    wishlistButton: {
      backgroundColor: "#fafafa",
      textColor: "#000000",
      borderColor: "#e5e7eb",
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
      buttonColor: "#2563eb",
      buttonTextColor: "#ffffff",
      borderRadius: 10,
      textColor: "#e5e5e5",
    },
    productHeader: {
      buyButtonColor: "#2563eb",
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
    reviewsSection: {
      backgroundColor: "transparent",
      textColor: "#fafafa",
      starColor: "#fafafa",
      cardBackgroundColor: "#1a1a1a",
      cardBorderColor: "#2a2a2a",
    },
    faqSection: {
      textColor: "#fafafa",
      borderColor: "#404040",
      iconColor: "#fafafa",
    },
    priceContainer: {
      backgroundColor: "#1a1a1a",
      textColor: "#fafafa",
      mutedTextColor: "#a1a1aa",
      borderColor: "#2a2a2a",
      iconColor: "#fafafa",
    },
    viewInLibraryButton: {
      backgroundColor: "#262626",
      textColor: "#fafafa",
      borderColor: "#404040",
    },
    announcementBar: {
      backgroundColor: "#171717",
      textColor: "#fafafa",
    },
    textBlock: {
      backgroundColor: "transparent",
      headlineColor: "#fafafa",
      contentColor: "#a1a1aa",
    },
    benefits: {
      backgroundColor: "transparent",
      textColor: "#fafafa",
      iconColor: "#a855f7",
    },
    imageText: {
      backgroundColor: "transparent",
      textColor: "#fafafa",
      buttonColor: "#404040",
      buttonTextColor: "#ffffff",
    },
    about: {
      backgroundColor: "transparent",
      textColor: "#fafafa",
      mutedTextColor: "#a1a1aa",
    },
    wishlistButton: {
      backgroundColor: "transparent",
      textColor: "#fafafa",
      borderColor: "#404040",
    },
  },
  bubble: {
    name: "Bubble",
    description: "Light UI with purple primary buttons",
    colors: {
      primary: "#8b5cf6",
      secondary: "#f5f3ff",
      accent: "#8b5cf6",
      background: "#ffffff",
      foreground: "#000000",
      muted: "#faf5ff",
      border: "#e5e7eb",
    },
    borderRadius: 8,
    buttonBorderRadius: 8,
    profileImageBorderColor: "#e5e7eb",
    subscribeBar: {
      buttonColor: "#ffffff",
      buttonTextColor: "#9d5cff",
      backgroundColor: "#8b5cf6",
      textColor: "#ffffff",
      buttonBorderRadius: 8,
      inputBorderColor: "rgba(255, 255, 255, 0.4)",
      inputTextColor: "#ffffff",
      inputPlaceholderColor: "rgba(255, 255, 255, 0.8)",
      inputBackgroundColor: "transparent",
    },
    creatorBar: {
      backgroundColor: "#8b5cf6",
      textColor: "#ffffff",
      buttonColor: "#ffffff",
      buttonTextColor: "#9d5cff",
      buttonBorderRadius: 8,
    },
    stickyAddToCart: {
      backgroundColor: "#ffffff",
      buttonColor: "#8b5cf6",
      buttonTextColor: "#ffffff",
      borderRadius: 8,
      textColor: "#000000",
    },
    productHeader: {
      buyButtonColor: "#8b5cf6",
      buyButtonTextColor: "#ffffff",
      buttonsBorderRadius: 8,
    },
    sections: {
      headerBackgroundColor: "#ffffff",
      headerTextColor: "#000000",
      featuredProductsBackgroundColor: "#faf5ff",
      featuredProductsTextColor: "#000000",
      footerBackgroundColor: "#faf5ff",
      footerTextColor: "#6b7280",
      pageBackgroundColor: "#ffffff",
    },
    productCard: {
      backgroundColor: "#ffffff",
      textColor: "#000000",
      priceColor: "#6b7280",
      borderColor: "#e5e7eb",
    },
    categoryFilter: {
      textColor: "#6b7280",
      activeTextColor: "#000000",
      borderColor: "#8b5cf6",
    },
    reviewsSection: {
      backgroundColor: "#ffffff",
      textColor: "#000000",
      starColor: "#8b5cf6",
      cardBackgroundColor: "#ffffff",
      cardBorderColor: "#e5e7eb",
    },
    faqSection: {
      textColor: "#000000",
      borderColor: "#e5e7eb",
      iconColor: "#8b5cf6",
    },
    priceContainer: {
      backgroundColor: "#ffffff",
      textColor: "#000000",
      mutedTextColor: "#6b7280",
      borderColor: "#e5e7eb",
      iconColor: "#8b5cf6",
    },
    viewInLibraryButton: {
      backgroundColor: "transparent",
      textColor: "#000000",
      borderColor: "#e5e7eb",
    },
    announcementBar: {
      backgroundColor: "#f5f3ff",
      textColor: "#000000",
    },
    textBlock: {
      backgroundColor: "#ffffff",
      headlineColor: "#000000",
      contentColor: "#4b5563",
    },
    benefits: {
      backgroundColor: "#ffffff",
      textColor: "#000000",
      iconColor: "#8b5cf6",
    },
    imageText: {
      backgroundColor: "#ffffff",
      textColor: "#000000",
      buttonColor: "#8b5cf6",
      buttonTextColor: "#ffffff",
    },
    about: {
      backgroundColor: "#ffffff",
      textColor: "#000000",
      mutedTextColor: "#6b7280",
    },
    wishlistButton: {
      backgroundColor: "transparent",
      textColor: "#000000",
      borderColor: "#e5e7eb",
    },
  },
  pink: {
    name: "Pink",
    description: "Light UI with pink primary accents",
    colors: {
      primary: "#ec4899",
      secondary: "#fdf2f8",
      accent: "#ec4899",
      background: "#ffffff",
      foreground: "#000000",
      muted: "#fdf2f8",
      border: "#fce7f3",
    },
    borderRadius: 8,
    buttonBorderRadius: 8,
    profileImageBorderColor: "#fce7f3",
    subscribeBar: {
      buttonColor: "#ec4899",
      buttonTextColor: "#ffffff",
      backgroundColor: "#ffffff",
      textColor: "#000000",
      buttonBorderRadius: 8,
      inputBorderColor: "#fce7f3",
      inputTextColor: "#000000",
      inputPlaceholderColor: "#9ca3af",
      inputBackgroundColor: "transparent",
    },
    creatorBar: {
      backgroundColor: "#ffffff",
      textColor: "#000000",
      buttonColor: "#ec4899",
      buttonTextColor: "#ffffff",
      buttonBorderRadius: 8,
    },
    stickyAddToCart: {
      backgroundColor: "#ffffff",
      buttonColor: "#ec4899",
      buttonTextColor: "#ffffff",
      borderRadius: 8,
      textColor: "#000000",
    },
    productHeader: {
      buyButtonColor: "#ec4899",
      buyButtonTextColor: "#ffffff",
      buttonsBorderRadius: 8,
    },
    sections: {
      headerBackgroundColor: "#ffffff",
      headerTextColor: "#000000",
      featuredProductsBackgroundColor: "#fdf2f8",
      featuredProductsTextColor: "#000000",
      footerBackgroundColor: "#fdf2f8",
      footerTextColor: "#6b7280",
      pageBackgroundColor: "#ffffff",
    },
    productCard: {
      backgroundColor: "#ffffff",
      textColor: "#000000",
      priceColor: "#6b7280",
      borderColor: "#fce7f3",
    },
    categoryFilter: {
      textColor: "#6b7280",
      activeTextColor: "#000000",
      borderColor: "#ec4899",
    },
    reviewsSection: {
      backgroundColor: "#ffffff",
      textColor: "#000000",
      starColor: "#ec4899",
      cardBackgroundColor: "#ffffff",
      cardBorderColor: "#fce7f3",
    },
    faqSection: {
      textColor: "#000000",
      borderColor: "#fce7f3",
      iconColor: "#ec4899",
    },
    priceContainer: {
      backgroundColor: "#ffffff",
      textColor: "#000000",
      mutedTextColor: "#6b7280",
      borderColor: "#fce7f3",
      iconColor: "#ec4899",
    },
    viewInLibraryButton: {
      backgroundColor: "transparent",
      textColor: "#000000",
      borderColor: "#fce7f3",
    },
    announcementBar: {
      backgroundColor: "#fdf2f8",
      textColor: "#000000",
    },
    textBlock: {
      backgroundColor: "#ffffff",
      headlineColor: "#000000",
      contentColor: "#4b5563",
    },
    benefits: {
      backgroundColor: "#ffffff",
      textColor: "#000000",
      iconColor: "#ec4899",
    },
    imageText: {
      backgroundColor: "#ffffff",
      textColor: "#000000",
      buttonColor: "#ec4899",
      buttonTextColor: "#ffffff",
    },
    about: {
      backgroundColor: "#ffffff",
      textColor: "#000000",
      mutedTextColor: "#6b7280",
    },
    wishlistButton: {
      backgroundColor: "transparent",
      textColor: "#000000",
      borderColor: "#fce7f3",
    },
  },
  cream: {
    name: "Cream",
    description: "Warm cream background with golden accents",
    colors: {
      primary: "#896d34",
      secondary: "#f5efe3",
      accent: "#896d34",
      background: "#FAF4E8",
      foreground: "#000000",
      muted: "#f5efe3",
      border: "#e8dfc9",
    },
    borderRadius: 8,
    buttonBorderRadius: 8,
    profileImageBorderColor: "#e8dfc9",
    subscribeBar: {
      buttonColor: "#896d34",
      buttonTextColor: "#ffffff",
      backgroundColor: "#FAF4E8",
      textColor: "#000000",
      buttonBorderRadius: 8,
      inputBorderColor: "#e8dfc9",
      inputTextColor: "#000000",
      inputPlaceholderColor: "#9ca3af",
      inputBackgroundColor: "transparent",
    },
    creatorBar: {
      backgroundColor: "#FAF4E8",
      textColor: "#000000",
      buttonColor: "#896d34",
      buttonTextColor: "#ffffff",
      buttonBorderRadius: 8,
    },
    stickyAddToCart: {
      backgroundColor: "#FAF4E8",
      buttonColor: "#896d34",
      buttonTextColor: "#ffffff",
      borderRadius: 8,
      textColor: "#896d34",
    },
    productHeader: {
      buyButtonColor: "#896d34",
      buyButtonTextColor: "#ffffff",
      buttonsBorderRadius: 8,
    },
    sections: {
      headerBackgroundColor: "#FAF4E8",
      headerTextColor: "#000000",
      featuredProductsBackgroundColor: "#FAF4E8",
      featuredProductsTextColor: "#000000",
      footerBackgroundColor: "#FAF4E8",
      footerTextColor: "#6b7280",
      pageBackgroundColor: "#FAF4E8",
    },
    productCard: {
      backgroundColor: "#ffffff",
      textColor: "#000000",
      priceColor: "#896d34",
      borderColor: "#e8dfc9",
    },
    categoryFilter: {
      textColor: "#6b7280",
      activeTextColor: "#896d34",
      borderColor: "#896d34",
    },
    reviewsSection: {
      backgroundColor: "#FAF4E8",
      textColor: "#000000",
      starColor: "#896d34",
      cardBackgroundColor: "#ffffff",
      cardBorderColor: "#e8dfc9",
    },
    faqSection: {
      textColor: "#000000",
      borderColor: "#e8dfc9",
      iconColor: "#896d34",
    },
    priceContainer: {
      backgroundColor: "#f5efe3",
      textColor: "#000000",
      mutedTextColor: "#6b7280",
      borderColor: "#e8dfc9",
      iconColor: "#896d34",
    },
    viewInLibraryButton: {
      backgroundColor: "transparent",
      textColor: "#000000",
      borderColor: "#e8dfc9",
    },
    announcementBar: {
      backgroundColor: "#f9e0ae",
      textColor: "#000000",
    },
    textBlock: {
      backgroundColor: "#FAF4E8",
      headlineColor: "#000000",
      contentColor: "#4b5563",
    },
    benefits: {
      backgroundColor: "#FAF4E8",
      textColor: "#000000",
      iconColor: "#896d34",
    },
    imageText: {
      backgroundColor: "#FAF4E8",
      textColor: "#000000",
      buttonColor: "#896d34",
      buttonTextColor: "#ffffff",
    },
    about: {
      backgroundColor: "#FAF4E8",
      textColor: "#000000",
      mutedTextColor: "#6b7280",
    },
    wishlistButton: {
      backgroundColor: "transparent",
      textColor: "#000000",
      borderColor: "#e8dfc9",
    },
  },
  blacks: {
    name: "Blacks",
    description: "Sleek light UI with black accents and buttons",
    colors: {
      primary: "#000000",
      secondary: "#f5f5f5",
      accent: "#000000",
      background: "#ffffff",
      foreground: "#000000",
      muted: "#f8fafc",
      border: "#e5e7eb",
    },
    borderRadius: 8,
    buttonBorderRadius: 8,
    profileImageBorderColor: "#e5e7eb",
    subscribeBar: {
      buttonColor: "#ffffff",
      buttonTextColor: "#000000",
      backgroundColor: "#000000",
      textColor: "#ffffff",
      buttonBorderRadius: 8,
      inputBorderColor: "rgba(255, 255, 255, 0.4)",
      inputTextColor: "#ffffff",
      inputPlaceholderColor: "rgba(255, 255, 255, 0.8)",
      inputBackgroundColor: "transparent",
    },
    creatorBar: {
      backgroundColor: "#000000",
      textColor: "#ffffff",
      buttonColor: "#ffffff",
      buttonTextColor: "#000000",
      buttonBorderRadius: 8,
    },
    stickyAddToCart: {
      backgroundColor: "#ffffff",
      buttonColor: "#000000",
      buttonTextColor: "#ffffff",
      borderRadius: 8,
      textColor: "#000000",
    },
    productHeader: {
      buyButtonColor: "#000000",
      buyButtonTextColor: "#ffffff",
      buttonsBorderRadius: 8,
    },
    sections: {
      headerBackgroundColor: "#ffffff",
      headerTextColor: "#000000",
      featuredProductsBackgroundColor: "#ffffff",
      featuredProductsTextColor: "#000000",
      footerBackgroundColor: "#f8fafc",
      footerTextColor: "#6b7280",
      pageBackgroundColor: "#ffffff",
    },
    productCard: {
      backgroundColor: "#ffffff",
      textColor: "#000000",
      priceColor: "#6b7280",
      borderColor: "#e5e7eb",
    },
    categoryFilter: {
      textColor: "#6b7280",
      activeTextColor: "#000000",
      borderColor: "#000000",
    },
    reviewsSection: {
      backgroundColor: "#ffffff",
      textColor: "#000000",
      starColor: "#000000",
      cardBackgroundColor: "#ffffff",
      cardBorderColor: "#e5e7eb",
    },
    faqSection: {
      textColor: "#000000",
      borderColor: "#e5e7eb",
      iconColor: "#000000",
    },
    priceContainer: {
      backgroundColor: "#ffffff",
      textColor: "#000000",
      mutedTextColor: "#6b7280",
      borderColor: "#e5e7eb",
      iconColor: "#000000",
    },
    viewInLibraryButton: {
      backgroundColor: "transparent",
      textColor: "#000000",
      borderColor: "#e5e7eb",
    },
    announcementBar: {
      backgroundColor: "#000000",
      textColor: "#ffffff",
    },
    textBlock: {
      backgroundColor: "#ffffff",
      headlineColor: "#000000",
      contentColor: "#4b5563",
    },
    benefits: {
      backgroundColor: "#ffffff",
      textColor: "#000000",
      iconColor: "#000000",
    },
    imageText: {
      backgroundColor: "#ffffff",
      textColor: "#000000",
      buttonColor: "#000000",
      buttonTextColor: "#ffffff",
    },
    about: {
      backgroundColor: "#ffffff",
      textColor: "#000000",
      mutedTextColor: "#6b7280",
    },
    wishlistButton: {
      backgroundColor: "#fafafa",
      textColor: "#000000",
      borderColor: "#e5e7eb",
    },
  },
  fusion: {
    name: "Fusion",
    description: "Vibrant gradient wallpaper with modern glass elements",
    colors: {
      primary: "#8b5cf6",
      secondary: "#1a1a2e",
      accent: "#ec4899",
      background: "#0f0f1a",
      foreground: "#ffffff",
      muted: "#1a1a2e",
      border: "#2d2d44",
    },
    borderRadius: 12,
    buttonBorderRadius: 12,
    profileImageBorderColor: "#8b5cf6",
    subscribeBar: {
      buttonColor: "#8b5cf6",
      buttonTextColor: "#ffffff",
      backgroundColor: "rgba(26, 26, 46, 0.8)",
      textColor: "#ffffff",
      buttonBorderRadius: 12,
      inputBorderColor: "rgba(139, 92, 246, 0.4)",
      inputTextColor: "#ffffff",
      inputPlaceholderColor: "rgba(255, 255, 255, 0.6)",
      inputBackgroundColor: "transparent",
    },
    creatorBar: {
      backgroundColor: "rgba(26, 26, 46, 0.8)",
      textColor: "#ffffff",
      buttonColor: "#8b5cf6",
      buttonTextColor: "#ffffff",
      buttonBorderRadius: 12,
    },
    stickyAddToCart: {
      backgroundColor: "rgba(15, 15, 26, 0.95)",
      buttonColor: "#8b5cf6",
      buttonTextColor: "#ffffff",
      borderRadius: 12,
      textColor: "#ffffff",
    },
    productHeader: {
      buyButtonColor: "#8b5cf6",
      buyButtonTextColor: "#ffffff",
      buttonsBorderRadius: 12,
    },
    sections: {
      headerBackgroundColor: "transparent",
      headerTextColor: "#ffffff",
      featuredProductsBackgroundColor: "transparent",
      featuredProductsTextColor: "#ffffff",
      footerBackgroundColor: "rgba(15, 15, 26, 0.8)",
      footerTextColor: "#a1a1aa",
      pageBackgroundColor: "#0f0f1a",
    },
    productCard: {
      backgroundColor: "rgba(26, 26, 46, 0.6)",
      textColor: "#ffffff",
      priceColor: "#e9d5ff",
      borderColor: "rgba(139, 92, 246, 0.3)",
    },
    categoryFilter: {
      textColor: "#a1a1aa",
      activeTextColor: "#ffffff",
      borderColor: "#8b5cf6",
    },
    reviewsSection: {
      backgroundColor: "transparent",
      textColor: "#ffffff",
      starColor: "#8b5cf6",
      cardBackgroundColor: "rgba(26, 26, 46, 0.6)",
      cardBorderColor: "rgba(139, 92, 246, 0.3)",
    },
    faqSection: {
      textColor: "#ffffff",
      borderColor: "rgba(139, 92, 246, 0.3)",
      iconColor: "#8b5cf6",
    },
    priceContainer: {
      backgroundColor: "rgba(26, 26, 46, 0.6)",
      textColor: "#ffffff",
      mutedTextColor: "#a1a1aa",
      borderColor: "rgba(139, 92, 246, 0.3)",
      iconColor: "#8b5cf6",
    },
    viewInLibraryButton: {
      backgroundColor: "rgba(139, 92, 246, 0.2)",
      textColor: "#ffffff",
      borderColor: "rgba(139, 92, 246, 0.4)",
    },
    announcementBar: {
      backgroundColor: "rgba(139, 92, 246, 0.3)",
      textColor: "#ffffff",
    },
    textBlock: {
      backgroundColor: "transparent",
      headlineColor: "#ffffff",
      contentColor: "#d1d5db",
    },
    benefits: {
      backgroundColor: "transparent",
      textColor: "#ffffff",
      iconColor: "#8b5cf6",
    },
    imageText: {
      backgroundColor: "transparent",
      textColor: "#ffffff",
      buttonColor: "#8b5cf6",
      buttonTextColor: "#ffffff",
    },
    about: {
      backgroundColor: "transparent",
      textColor: "#ffffff",
      mutedTextColor: "#a1a1aa",
    },
    wishlistButton: {
      backgroundColor: "rgba(139, 92, 246, 0.2)",
      textColor: "#ffffff",
      borderColor: "rgba(139, 92, 246, 0.4)",
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
  storeBio: "",
  storeNicheTags: [],
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
  showHeadline: false,
  showBio: true,
  showNicheTags: true,
  showStats: true,
  showTotalSalesBadge: true,
  showSocialMedia: true,
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
  showProductsStats: true,
  memberSince: undefined,
  totalSales: undefined,
  productsCount: undefined,
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

export const defaultFAQSettings: FAQSettings = {
  visible: true,
  headline: "Frequently Asked Questions",
  customFaqs: [],
  spacing: {
    paddingTop: 32,
    paddingBottom: 32,
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
