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
  CommunitySettings,
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
      background: "#111113",
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
      backgroundColor: "#191b1e",
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
      backgroundColor: "#191b1e",
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
    /**
     * ONE DARK GREY, NOT TWO BLACKS.
     *
     * The page was #0a0a0a and the Featured band #0f0f0f, which is a five
     * point difference: invisible as a colour and perfectly visible as a
     * LINE across the page where the two meet. A creator sees a seam under
     * the tab strip and reads it as a rendering fault, which is what it is.
     *
     * And it is no longer pitch black. #0a0a0a is four points off #000000 —
     * on an OLED phone that is the panel switching off, so the page has no
     * edges, the cover has no edge, and a dark photo bleeds into the page
     * around it. #111113 is still unmistakably a dark theme and still has a
     * surface.
     */
    sections: {
      headerBackgroundColor: "#111113",
      headerTextColor: "#fafafa",
      featuredProductsBackgroundColor: "#111113",
      featuredProductsTextColor: "#fafafa",
      footerBackgroundColor: "#111113",
      footerTextColor: "#a1a1aa",
      pageBackgroundColor: "#111113",
    },
    productCard: {
      backgroundColor: "#1c1e22",
      textColor: "#fafafa",
      priceColor: "#a1a1aa",
      borderColor: "#2e3136",
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
      cardBackgroundColor: "#1c1e22",
      cardBorderColor: "#2e3136",
    },
    faqSection: {
      textColor: "#fafafa",
      borderColor: "#404040",
      iconColor: "#fafafa",
    },
    priceContainer: {
      backgroundColor: "#1c1e22",
      textColor: "#fafafa",
      mutedTextColor: "#a1a1aa",
      borderColor: "#2e3136",
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
      secondary: "#FBE8F1",
      accent: "#ec4899",
      background: "#FDF2F8",
      foreground: "#000000",
      muted: "#FBE8F1",
      border: "#F6D8E8",
    },
    borderRadius: 8,
    buttonBorderRadius: 8,
    profileImageBorderColor: "#F6D8E8",
    /**
     * THE BUTTONS ARE #db2777, NOT THE ACCENT #ec4899. White text on the
     * accent pink measures 3.53 to 1, under WCAG AA (4.5); on pink-600 it is
     * 4.60, the lightest pink that passes. The accent stays where nothing
     * sits on it: borders, the active filter, the price. Held to the number
     * by tests/creator-page.test.ts.
     */
    subscribeBar: {
      buttonColor: "#db2777",
      buttonTextColor: "#ffffff",
      backgroundColor: "#FDF2F8",
      textColor: "#000000",
      buttonBorderRadius: 8,
      inputBorderColor: "#F6D8E8",
      inputTextColor: "#000000",
      inputPlaceholderColor: "#9ca3af",
      inputBackgroundColor: "transparent",
    },
    creatorBar: {
      backgroundColor: "#FDF2F8",
      textColor: "#000000",
      buttonColor: "#db2777",
      buttonTextColor: "#ffffff",
      buttonBorderRadius: 8,
    },
    stickyAddToCart: {
      backgroundColor: "#FDF2F8",
      buttonColor: "#db2777",
      buttonTextColor: "#ffffff",
      borderRadius: 8,
      textColor: "#000000",
    },
    productHeader: {
      buyButtonColor: "#db2777",
      buyButtonTextColor: "#ffffff",
      buttonsBorderRadius: 8,
    },
    sections: {
      headerBackgroundColor: "#FDF2F8",
      headerTextColor: "#000000",
      /**
       * ONE TINT EVERYWHERE, WHICH IS WHY THERE IS NO BAND.
       *
       * An earlier round put the tint on the Featured section ALONE, and six
       * values of difference against a white page drew a LINE across it where
       * the band began. The answer to that line was taken to be white
       * everywhere, and the result was a scheme that changed a button and
       * nothing else: pink's page, header, footer and bars all measured
       * #ffffff, the same as Default's, which is the "pink does not apply"
       * that was reported.
       *
       * The answer to a band is not white, it is the SAME colour on both
       * sides of the seam. Header, featured, footer, page and every bar
       * carry #FDF2F8, so there is no edge for a line to live on, and the
       * white product cards sit on top of it the way cream's do.
       */
      featuredProductsBackgroundColor: "#FDF2F8",
      featuredProductsTextColor: "#000000",
      footerBackgroundColor: "#FDF2F8",
      footerTextColor: "#4b5563",
      pageBackgroundColor: "#FDF2F8",
    },
    productCard: {
      backgroundColor: "#ffffff",
      textColor: "#000000",
      priceColor: "#4b5563",
      borderColor: "#F6D8E8",
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
      backgroundColor: "#FDF2F8",
      textColor: "#000000",
      buttonColor: "#db2777",
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
      /* #6b7280 measures 4.41 against cream's #FAF4E8, just under AA. */
      footerTextColor: "#4b5563",
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
      /* A hair darker than #6b7280, which read 4.2 to 1 on this card (the
         struck through price on the product page); 4.7 now, above AA. */
      mutedTextColor: "#646a76",
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
  /*
    THREE MORE, EACH A DIFFERENT ANSWER TO THE ONES ALREADY OFFERED: a green,
    a navy and a terracotta, each on a page tinted toward its own accent with
    white cards on it, so the cards read as cards on every one of them. All
    three are light pages. (They had to be: the product page decided "dark"
    by the scheme's name then. It decides by the page colour now, which is
    what let graphite, below, be offered.)
  */
  sage: {
    name: "Sage",
    description: "Soft green grey with deep forest accents",
    colors: {
      primary: "#2F5D46",
      secondary: "#E6EBE0",
      accent: "#2F5D46",
      background: "#EEF1EA",
      foreground: "#1B2620",
      muted: "#E6EBE0",
      border: "#D9E0D2",
    },
    borderRadius: 8,
    buttonBorderRadius: 8,
    profileImageBorderColor: "#D9E0D2",
    subscribeBar: {
      buttonColor: "#2F5D46",
      buttonTextColor: "#ffffff",
      backgroundColor: "#EEF1EA",
      textColor: "#1B2620",
      buttonBorderRadius: 8,
      inputBorderColor: "#D9E0D2",
      inputTextColor: "#1B2620",
      inputPlaceholderColor: "#8A968D",
      inputBackgroundColor: "transparent",
    },
    creatorBar: {
      backgroundColor: "#EEF1EA",
      textColor: "#1B2620",
      buttonColor: "#2F5D46",
      buttonTextColor: "#ffffff",
      buttonBorderRadius: 8,
    },
    stickyAddToCart: {
      backgroundColor: "#EEF1EA",
      buttonColor: "#2F5D46",
      buttonTextColor: "#ffffff",
      borderRadius: 8,
      textColor: "#1B2620",
    },
    productHeader: {
      buyButtonColor: "#2F5D46",
      buyButtonTextColor: "#ffffff",
      buttonsBorderRadius: 8,
    },
    sections: {
      headerBackgroundColor: "#EEF1EA",
      headerTextColor: "#1B2620",
      featuredProductsBackgroundColor: "#EEF1EA",
      featuredProductsTextColor: "#1B2620",
      footerBackgroundColor: "#E4E9DD",
      footerTextColor: "#4A5A4F",
      pageBackgroundColor: "#EEF1EA",
    },
    productCard: {
      backgroundColor: "#ffffff",
      textColor: "#1B2620",
      priceColor: "#2F5D46",
      borderColor: "#D9E0D2",
    },
    categoryFilter: {
      textColor: "#4A5A4F",
      activeTextColor: "#1B2620",
      borderColor: "#2F5D46",
    },
    reviewsSection: {
      backgroundColor: "#EEF1EA",
      textColor: "#1B2620",
      starColor: "#2F5D46",
      cardBackgroundColor: "#ffffff",
      cardBorderColor: "#D9E0D2",
    },
    faqSection: {
      textColor: "#1B2620",
      borderColor: "#D9E0D2",
      iconColor: "#2F5D46",
    },
    priceContainer: {
      backgroundColor: "#E6EBE0",
      textColor: "#1B2620",
      mutedTextColor: "#4A5A4F",
      borderColor: "#D9E0D2",
      iconColor: "#2F5D46",
    },
    viewInLibraryButton: {
      backgroundColor: "transparent",
      textColor: "#1B2620",
      borderColor: "#D9E0D2",
    },
    announcementBar: {
      backgroundColor: "#DCE5D2",
      textColor: "#1B2620",
    },
    textBlock: {
      backgroundColor: "#EEF1EA",
      headlineColor: "#1B2620",
      contentColor: "#4A5A4F",
    },
    benefits: {
      backgroundColor: "#EEF1EA",
      textColor: "#1B2620",
      iconColor: "#2F5D46",
    },
    imageText: {
      backgroundColor: "#EEF1EA",
      textColor: "#1B2620",
      buttonColor: "#2F5D46",
      buttonTextColor: "#ffffff",
    },
    about: {
      backgroundColor: "#EEF1EA",
      textColor: "#1B2620",
      mutedTextColor: "#4A5A4F",
    },
    wishlistButton: {
      backgroundColor: "transparent",
      textColor: "#1B2620",
      borderColor: "#D9E0D2",
    },
  },
  harbor: {
    name: "Harbor",
    description: "Misty blue grey with deep navy accents",
    colors: {
      primary: "#1F4B6E",
      secondary: "#E3EAF0",
      accent: "#1F4B6E",
      background: "#ECF1F5",
      foreground: "#0F1E2C",
      muted: "#E3EAF0",
      border: "#D4DDE6",
    },
    borderRadius: 8,
    buttonBorderRadius: 8,
    profileImageBorderColor: "#D4DDE6",
    subscribeBar: {
      buttonColor: "#1F4B6E",
      buttonTextColor: "#ffffff",
      backgroundColor: "#ECF1F5",
      textColor: "#0F1E2C",
      buttonBorderRadius: 8,
      inputBorderColor: "#D4DDE6",
      inputTextColor: "#0F1E2C",
      inputPlaceholderColor: "#8795A3",
      inputBackgroundColor: "transparent",
    },
    creatorBar: {
      backgroundColor: "#ECF1F5",
      textColor: "#0F1E2C",
      buttonColor: "#1F4B6E",
      buttonTextColor: "#ffffff",
      buttonBorderRadius: 8,
    },
    stickyAddToCart: {
      backgroundColor: "#ECF1F5",
      buttonColor: "#1F4B6E",
      buttonTextColor: "#ffffff",
      borderRadius: 8,
      textColor: "#0F1E2C",
    },
    productHeader: {
      buyButtonColor: "#1F4B6E",
      buyButtonTextColor: "#ffffff",
      buttonsBorderRadius: 8,
    },
    sections: {
      headerBackgroundColor: "#ECF1F5",
      headerTextColor: "#0F1E2C",
      featuredProductsBackgroundColor: "#ECF1F5",
      featuredProductsTextColor: "#0F1E2C",
      footerBackgroundColor: "#E1E8EF",
      footerTextColor: "#475866",
      pageBackgroundColor: "#ECF1F5",
    },
    productCard: {
      backgroundColor: "#ffffff",
      textColor: "#0F1E2C",
      priceColor: "#1F4B6E",
      borderColor: "#D4DDE6",
    },
    categoryFilter: {
      textColor: "#475866",
      activeTextColor: "#0F1E2C",
      borderColor: "#1F4B6E",
    },
    reviewsSection: {
      backgroundColor: "#ECF1F5",
      textColor: "#0F1E2C",
      starColor: "#1F4B6E",
      cardBackgroundColor: "#ffffff",
      cardBorderColor: "#D4DDE6",
    },
    faqSection: {
      textColor: "#0F1E2C",
      borderColor: "#D4DDE6",
      iconColor: "#1F4B6E",
    },
    priceContainer: {
      backgroundColor: "#E3EAF0",
      textColor: "#0F1E2C",
      mutedTextColor: "#475866",
      borderColor: "#D4DDE6",
      iconColor: "#1F4B6E",
    },
    viewInLibraryButton: {
      backgroundColor: "transparent",
      textColor: "#0F1E2C",
      borderColor: "#D4DDE6",
    },
    announcementBar: {
      backgroundColor: "#D6E3EE",
      textColor: "#0F1E2C",
    },
    textBlock: {
      backgroundColor: "#ECF1F5",
      headlineColor: "#0F1E2C",
      contentColor: "#475866",
    },
    benefits: {
      backgroundColor: "#ECF1F5",
      textColor: "#0F1E2C",
      iconColor: "#1F4B6E",
    },
    imageText: {
      backgroundColor: "#ECF1F5",
      textColor: "#0F1E2C",
      buttonColor: "#1F4B6E",
      buttonTextColor: "#ffffff",
    },
    about: {
      backgroundColor: "#ECF1F5",
      textColor: "#0F1E2C",
      mutedTextColor: "#475866",
    },
    wishlistButton: {
      backgroundColor: "transparent",
      textColor: "#0F1E2C",
      borderColor: "#D4DDE6",
    },
  },
  clay: {
    name: "Clay",
    description: "Warm sand with terracotta accents",
    colors: {
      primary: "#A4492A",
      secondary: "#EFE5DC",
      accent: "#A4492A",
      background: "#F5EEE8",
      foreground: "#2A1C15",
      muted: "#EFE5DC",
      border: "#E6D8CC",
    },
    borderRadius: 8,
    buttonBorderRadius: 8,
    profileImageBorderColor: "#E6D8CC",
    subscribeBar: {
      buttonColor: "#A4492A",
      buttonTextColor: "#ffffff",
      backgroundColor: "#F5EEE8",
      textColor: "#2A1C15",
      buttonBorderRadius: 8,
      inputBorderColor: "#E6D8CC",
      inputTextColor: "#2A1C15",
      inputPlaceholderColor: "#9C8B7F",
      inputBackgroundColor: "transparent",
    },
    creatorBar: {
      backgroundColor: "#F5EEE8",
      textColor: "#2A1C15",
      buttonColor: "#A4492A",
      buttonTextColor: "#ffffff",
      buttonBorderRadius: 8,
    },
    stickyAddToCart: {
      backgroundColor: "#F5EEE8",
      buttonColor: "#A4492A",
      buttonTextColor: "#ffffff",
      borderRadius: 8,
      textColor: "#2A1C15",
    },
    productHeader: {
      buyButtonColor: "#A4492A",
      buyButtonTextColor: "#ffffff",
      buttonsBorderRadius: 8,
    },
    sections: {
      headerBackgroundColor: "#F5EEE8",
      headerTextColor: "#2A1C15",
      featuredProductsBackgroundColor: "#F5EEE8",
      featuredProductsTextColor: "#2A1C15",
      footerBackgroundColor: "#EEE4DA",
      footerTextColor: "#5E4A3F",
      pageBackgroundColor: "#F5EEE8",
    },
    productCard: {
      backgroundColor: "#ffffff",
      textColor: "#2A1C15",
      priceColor: "#A4492A",
      borderColor: "#E6D8CC",
    },
    categoryFilter: {
      textColor: "#5E4A3F",
      activeTextColor: "#2A1C15",
      borderColor: "#A4492A",
    },
    reviewsSection: {
      backgroundColor: "#F5EEE8",
      textColor: "#2A1C15",
      starColor: "#A4492A",
      cardBackgroundColor: "#ffffff",
      cardBorderColor: "#E6D8CC",
    },
    faqSection: {
      textColor: "#2A1C15",
      borderColor: "#E6D8CC",
      iconColor: "#A4492A",
    },
    priceContainer: {
      backgroundColor: "#EFE5DC",
      textColor: "#2A1C15",
      mutedTextColor: "#5E4A3F",
      borderColor: "#E6D8CC",
      iconColor: "#A4492A",
    },
    viewInLibraryButton: {
      backgroundColor: "transparent",
      textColor: "#2A1C15",
      borderColor: "#E6D8CC",
    },
    announcementBar: {
      backgroundColor: "#F0D5C6",
      textColor: "#2A1C15",
    },
    textBlock: {
      backgroundColor: "#F5EEE8",
      headlineColor: "#2A1C15",
      contentColor: "#5E4A3F",
    },
    benefits: {
      backgroundColor: "#F5EEE8",
      textColor: "#2A1C15",
      iconColor: "#A4492A",
    },
    imageText: {
      backgroundColor: "#F5EEE8",
      textColor: "#2A1C15",
      buttonColor: "#A4492A",
      buttonTextColor: "#ffffff",
    },
    about: {
      backgroundColor: "#F5EEE8",
      textColor: "#2A1C15",
      mutedTextColor: "#5E4A3F",
    },
    wishlistButton: {
      backgroundColor: "transparent",
      textColor: "#2A1C15",
      borderColor: "#E6D8CC",
    },
  },
  /*
    GRAPHITE, THE SECOND DARK ANSWER. Astrid is near black with grey
    buttons; this is a lifted charcoal with a cool steel accent, the page one
    step lighter so photos and cards keep their edges. It could only be
    offered once the product page decided "dark" by the page colour
    (lib/store-builder/scheme-tone) rather than by the name astrid. Every pair
    holds AA: white on the steel button 5.4, the muted grey 6.5 on a card.
  */
  graphite: {
    name: "Graphite",
    description: "Lifted charcoal with cool steel accents",
    colors: {
      primary: "#4F6D8F",
      secondary: "#2E3238",
      accent: "#8FA8C4",
      background: "#1D2025",
      foreground: "#EEF0F3",
      muted: "#23272D",
      border: "#353A42",
    },
    borderRadius: 10,
    buttonBorderRadius: 10,
    profileImageBorderColor: "#3F454E",
    subscribeBar: {
      buttonColor: "#4F6D8F",
      buttonTextColor: "#ffffff",
      backgroundColor: "#23272D",
      textColor: "#E3E6EA",
      buttonBorderRadius: 10,
      inputBorderColor: "#353A42",
      inputTextColor: "#E3E6EA",
      inputPlaceholderColor: "#8A919B",
      inputBackgroundColor: "transparent",
    },
    creatorBar: {
      backgroundColor: "#1D2025",
      textColor: "#E3E6EA",
      buttonColor: "#4F6D8F",
      buttonTextColor: "#ffffff",
      buttonBorderRadius: 10,
    },
    stickyAddToCart: {
      backgroundColor: "#23272D",
      buttonColor: "#4F6D8F",
      buttonTextColor: "#ffffff",
      borderRadius: 10,
      textColor: "#E3E6EA",
    },
    productHeader: {
      buyButtonColor: "#4F6D8F",
      buyButtonTextColor: "#ffffff",
      buttonsBorderRadius: 10,
    },
    /* One surface from the header to the footer, as astrid learned: two near blacks meet as a seam. */
    sections: {
      headerBackgroundColor: "#1D2025",
      headerTextColor: "#EEF0F3",
      featuredProductsBackgroundColor: "#1D2025",
      featuredProductsTextColor: "#EEF0F3",
      footerBackgroundColor: "#1D2025",
      footerTextColor: "#A9B0BA",
      pageBackgroundColor: "#1D2025",
    },
    productCard: {
      backgroundColor: "#272B31",
      textColor: "#EEF0F3",
      priceColor: "#A9B0BA",
      borderColor: "#353A42",
    },
    categoryFilter: {
      textColor: "#A9B0BA",
      activeTextColor: "#EEF0F3",
      borderColor: "#EEF0F3",
    },
    reviewsSection: {
      backgroundColor: "transparent",
      textColor: "#EEF0F3",
      starColor: "#EEF0F3",
      cardBackgroundColor: "#272B31",
      cardBorderColor: "#353A42",
    },
    faqSection: {
      textColor: "#EEF0F3",
      borderColor: "#353A42",
      iconColor: "#EEF0F3",
    },
    priceContainer: {
      backgroundColor: "#272B31",
      textColor: "#EEF0F3",
      mutedTextColor: "#A9B0BA",
      borderColor: "#353A42",
      iconColor: "#EEF0F3",
    },
    viewInLibraryButton: {
      backgroundColor: "#2E3238",
      textColor: "#EEF0F3",
      borderColor: "#3F454E",
    },
    announcementBar: {
      backgroundColor: "#272B31",
      textColor: "#EEF0F3",
    },
    textBlock: {
      backgroundColor: "transparent",
      headlineColor: "#EEF0F3",
      contentColor: "#A9B0BA",
    },
    benefits: {
      backgroundColor: "transparent",
      textColor: "#EEF0F3",
      iconColor: "#8FA8C4",
    },
    imageText: {
      backgroundColor: "transparent",
      textColor: "#EEF0F3",
      buttonColor: "#4F6D8F",
      buttonTextColor: "#ffffff",
    },
    about: {
      backgroundColor: "transparent",
      textColor: "#EEF0F3",
      mutedTextColor: "#A9B0BA",
    },
    wishlistButton: {
      backgroundColor: "transparent",
      textColor: "#EEF0F3",
      borderColor: "#3F454E",
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
  footerSettings: {
    footerType: "simple",
    columns: ["navigation"],
    showPaymentIcons: false,
    showPoweredBy: true,
    sectionHeight: 80,
    headingSize: "h3",
    textFontSize: "medium",
  },
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
  // Sticky, and revealed on scroll up. The bar is the one thing on a creator
  // page with a job to do, and a subscribe field that has scrolled away cannot
  // do it. Reveal-on-scroll-up rather than always-pinned so it is out of the way
  // while somebody is reading down the page.
  //
  // A creator who has already saved a config keeps whatever they saved; this is
  // the value for anyone who has never touched the toggle. Both remain settings
  // in the builder's subscribe-bar panel.
  enableStickyBar: true,
  enableStickyOnScrollUp: true,
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
    facebook: { enabled: false, url: "" },
    linkedin: { enabled: false, url: "" },
    twitch: { enabled: false, url: "" },
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
  imagePosition: "left",
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

export const defaultCommunitySettings: CommunitySettings = {
  visible: true,
  communityId: "",
  headline: "",
  showStats: true,
  showEvents: true,
  showPosts: true,
  showMembers: true,
  showLeaderboard: false,
  showReviews: true,
  showJoin: true,
  spacing: {
    paddingTop: 40,
    paddingBottom: 40,
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
    fontSize: 20,
    fontWeight: "semibold",
    textAlign: "left",
  },
}

// Section library for adding new sections
export const sectionLibrary: SectionLibraryItem[] = [
  {type:"native-form",name:"Form or quiz",description:"Collect answers in Audience and follow up with leads",icon:"mail",defaultSettings:{form_id:"",title:"Open form",inline:true,visible:true,spacing:{paddingTop:24,paddingBottom:24},colors:{},typography:{}}},
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
  /* Offered only on the shop page and only while communities are on (components/store-builder/add-section-modal.tsx). */
  {
    type: "community",
    name: "Community",
    description: "One of your communities, with its members, events and latest posts",
    icon: "users",
    defaultSettings: defaultCommunitySettings,
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
  /*
    A STEP UP, NOT A JUMP. 137 was the medium and it read a little small
    against the name under it; 150 is about a tenth bigger, which is the
    difference between "that is the creator" and "there is a photo here",
    without turning the header into a portrait. The overlap with the cover is
    derived from this number rather than hardcoded, so the circle still
    straddles the cover's edge by the same proportion at any size.

    AND FIVE PERCENT MORE, asked for by the owner for every creator page:
    150 to 158 and 118 to 124, so the photo holds its own against the
    cover above it. Profiles that share the look (components/profile/
    profile-hero.tsx) grew by the same five percent.
  */
  small: 124,
  medium: 158, // kept for backwards compatibility
  large: 158, // same as medium
}
