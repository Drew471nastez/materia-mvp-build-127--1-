import type { ThemePreset } from "./types"

// ============================================
// Theme Configuration Interface
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
  // Component-specific overrides
  subscribeBar: {
    buttonColor: string
    buttonTextColor: string
    backgroundColor: string
    textColor: string
    buttonBorderRadius: number
    inputBorderColor: string
    inputTextColor: string
    inputPlaceholderColor: string
  }
  profileRingColor: string
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
  }
  productHeader: {
    buyButtonColor: string
    buyButtonTextColor: string
    buttonsBorderRadius: number
  }
  sections: {
    headerBackgroundColor: string
    headerTextColor: string
    featuredProductsBackgroundColor: string
    featuredProductsTextColor: string
    footerBackgroundColor: string
    footerTextColor: string
    pageBackgroundColor: string
  }
  productCard: {
    backgroundColor: string
    textColor: string
    priceColor: string
    borderColor: string
  }
  categoryFilter: {
    textColor: string
    activeTextColor: string
    borderColor: string
  }
}

// ============================================
// Theme Presets
// ============================================

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
    subscribeBar: {
      buttonColor: "#6b7280",
      buttonTextColor: "#ffffff",
      backgroundColor: "#ffffff",
      textColor: "#374151",
      buttonBorderRadius: 8,
      inputBorderColor: "#e5e7eb",
      inputTextColor: "#374151",
      inputPlaceholderColor: "#9ca3af",
    },
    profileRingColor: "#ffffff",
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
    subscribeBar: {
      buttonColor: "#1e293b",
      buttonTextColor: "#ffffff",
      backgroundColor: "linear-gradient(180deg, #ffffff 0%, #e2e8f0 100%)",
      textColor: "#0f172a",
      buttonBorderRadius: 12,
      inputBorderColor: "#cbd5e1",
      inputTextColor: "#0f172a",
      inputPlaceholderColor: "#64748b",
    },
    profileRingColor: "#ffffff",
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
    },
    productHeader: {
      buyButtonColor: "#1e293b",
      buyButtonTextColor: "#ffffff",
      buttonsBorderRadius: 12,
    },
    sections: {
      headerBackgroundColor: "transparent",
      headerTextColor: "#0f172a",
      featuredProductsBackgroundColor: "linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)",
      featuredProductsTextColor: "#0f172a",
      footerBackgroundColor: "linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 100%)",
      footerTextColor: "#475569",
      pageBackgroundColor: "#f8fafc",
    },
    productCard: {
      backgroundColor: "#ffffff",
      textColor: "#0f172a",
      priceColor: "#475569",
      borderColor: "#e2e8f0",
    },
    categoryFilter: {
      textColor: "#64748b",
      activeTextColor: "#0f172a",
      borderColor: "#0f172a",
    },
  },
  charcoal: {
    name: "Charcoal",
    description: "Bold dark mode with accent colors",
    colors: {
      primary: "#1f1f1f",
      secondary: "#3a3a3a",
      accent: "#f5f5f5",
      background: "#0f0f0f",
      foreground: "#fafafa",
      muted: "#262626",
      border: "#333333",
    },
    borderRadius: 6,
    buttonBorderRadius: 6,
    subscribeBar: {
      buttonColor: "#fafafa",
      buttonTextColor: "#0f0f0f",
      backgroundColor: "#1a1a1a",
      textColor: "#fafafa",
      buttonBorderRadius: 6,
      inputBorderColor: "#333333",
      inputTextColor: "#fafafa",
      inputPlaceholderColor: "#737373",
    },
    profileRingColor: "#0f0f0f",
    creatorBar: {
      backgroundColor: "#1a1a1a",
      textColor: "#fafafa",
      buttonColor: "#fafafa",
      buttonTextColor: "#0f0f0f",
      buttonBorderRadius: 6,
    },
    stickyAddToCart: {
      backgroundColor: "#1a1a1a",
      buttonColor: "#fafafa",
      buttonTextColor: "#0f0f0f",
      borderRadius: 6,
    },
    productHeader: {
      buyButtonColor: "#fafafa",
      buyButtonTextColor: "#0f0f0f",
      buttonsBorderRadius: 6,
    },
    sections: {
      headerBackgroundColor: "transparent",
      headerTextColor: "#fafafa",
      featuredProductsBackgroundColor: "#1a1a1a",
      featuredProductsTextColor: "#fafafa",
      footerBackgroundColor: "#0a0a0a",
      footerTextColor: "#a1a1a1",
      pageBackgroundColor: "#0f0f0f",
    },
    productCard: {
      backgroundColor: "#1a1a1a",
      textColor: "#fafafa",
      priceColor: "#a1a1a1",
      borderColor: "#333333",
    },
    categoryFilter: {
      textColor: "#a1a1a1",
      activeTextColor: "#fafafa",
      borderColor: "#fafafa",
    },
  },
  ocean: {
    name: "Ocean",
    description: "Deep blue professional theme",
    colors: {
      primary: "#1e40af",
      secondary: "#3b82f6",
      accent: "#60a5fa",
      background: "#f0f9ff",
      foreground: "#1e3a5f",
      muted: "#e0f2fe",
      border: "#bae6fd",
    },
    borderRadius: 10,
    buttonBorderRadius: 10,
    subscribeBar: {
      buttonColor: "#1e40af",
      buttonTextColor: "#ffffff",
      backgroundColor: "#ffffff",
      textColor: "#1e3a5f",
      buttonBorderRadius: 10,
      inputBorderColor: "#bae6fd",
      inputTextColor: "#1e3a5f",
      inputPlaceholderColor: "#60a5fa",
    },
    profileRingColor: "#f0f9ff",
    creatorBar: {
      backgroundColor: "#1e40af",
      textColor: "#ffffff",
      buttonColor: "#3b82f6",
      buttonTextColor: "#ffffff",
      buttonBorderRadius: 10,
    },
    stickyAddToCart: {
      backgroundColor: "#f0f9ff",
      buttonColor: "#1e40af",
      buttonTextColor: "#ffffff",
      borderRadius: 10,
    },
    productHeader: {
      buyButtonColor: "#1e40af",
      buyButtonTextColor: "#ffffff",
      buttonsBorderRadius: 10,
    },
    sections: {
      headerBackgroundColor: "transparent",
      headerTextColor: "#1e3a5f",
      featuredProductsBackgroundColor: "#e0f2fe",
      featuredProductsTextColor: "#1e3a5f",
      footerBackgroundColor: "#dbeafe",
      footerTextColor: "#1e40af",
      pageBackgroundColor: "#f0f9ff",
    },
    productCard: {
      backgroundColor: "#ffffff",
      textColor: "#1e3a5f",
      priceColor: "#3b82f6",
      borderColor: "#bae6fd",
    },
    categoryFilter: {
      textColor: "#3b82f6",
      activeTextColor: "#1e3a5f",
      borderColor: "#1e3a5f",
    },
  },
  forest: {
    name: "Forest",
    description: "Natural earthy green tones",
    colors: {
      primary: "#166534",
      secondary: "#22c55e",
      accent: "#4ade80",
      background: "#f0fdf4",
      foreground: "#14532d",
      muted: "#dcfce7",
      border: "#bbf7d0",
    },
    borderRadius: 8,
    buttonBorderRadius: 8,
    subscribeBar: {
      buttonColor: "#166534",
      buttonTextColor: "#ffffff",
      backgroundColor: "#ffffff",
      textColor: "#14532d",
      buttonBorderRadius: 8,
      inputBorderColor: "#bbf7d0",
      inputTextColor: "#14532d",
      inputPlaceholderColor: "#4ade80",
    },
    profileRingColor: "#f0fdf4",
    creatorBar: {
      backgroundColor: "#166534",
      textColor: "#ffffff",
      buttonColor: "#22c55e",
      buttonTextColor: "#ffffff",
      buttonBorderRadius: 8,
    },
    stickyAddToCart: {
      backgroundColor: "#f0fdf4",
      buttonColor: "#166534",
      buttonTextColor: "#ffffff",
      borderRadius: 8,
    },
    productHeader: {
      buyButtonColor: "#166534",
      buyButtonTextColor: "#ffffff",
      buttonsBorderRadius: 8,
    },
    sections: {
      headerBackgroundColor: "transparent",
      headerTextColor: "#14532d",
      featuredProductsBackgroundColor: "#dcfce7",
      featuredProductsTextColor: "#14532d",
      footerBackgroundColor: "#d1fae5",
      footerTextColor: "#166534",
      pageBackgroundColor: "#f0fdf4",
    },
    productCard: {
      backgroundColor: "#ffffff",
      textColor: "#14532d",
      priceColor: "#22c55e",
      borderColor: "#bbf7d0",
    },
    categoryFilter: {
      textColor: "#22c55e",
      activeTextColor: "#14532d",
      borderColor: "#14532d",
    },
  },
  sunset: {
    name: "Sunset",
    description: "Warm orange and coral vibes",
    colors: {
      primary: "#c2410c",
      secondary: "#f97316",
      accent: "#fb923c",
      background: "#fff7ed",
      foreground: "#7c2d12",
      muted: "#ffedd5",
      border: "#fed7aa",
    },
    borderRadius: 12,
    buttonBorderRadius: 12,
    subscribeBar: {
      buttonColor: "#c2410c",
      buttonTextColor: "#ffffff",
      backgroundColor: "#ffffff",
      textColor: "#7c2d12",
      buttonBorderRadius: 12,
      inputBorderColor: "#fed7aa",
      inputTextColor: "#7c2d12",
      inputPlaceholderColor: "#fb923c",
    },
    profileRingColor: "#fff7ed",
    creatorBar: {
      backgroundColor: "#c2410c",
      textColor: "#ffffff",
      buttonColor: "#f97316",
      buttonTextColor: "#ffffff",
      buttonBorderRadius: 12,
    },
    stickyAddToCart: {
      backgroundColor: "#fff7ed",
      buttonColor: "#c2410c",
      buttonTextColor: "#ffffff",
      borderRadius: 12,
    },
    productHeader: {
      buyButtonColor: "#c2410c",
      buyButtonTextColor: "#ffffff",
      buttonsBorderRadius: 12,
    },
    sections: {
      headerBackgroundColor: "transparent",
      headerTextColor: "#7c2d12",
      featuredProductsBackgroundColor: "#ffedd5",
      featuredProductsTextColor: "#7c2d12",
      footerBackgroundColor: "#fef3c7",
      footerTextColor: "#c2410c",
      pageBackgroundColor: "#fff7ed",
    },
    productCard: {
      backgroundColor: "#ffffff",
      textColor: "#7c2d12",
      priceColor: "#f97316",
      borderColor: "#fed7aa",
    },
    categoryFilter: {
      textColor: "#f97316",
      activeTextColor: "#7c2d12",
      borderColor: "#7c2d12",
    },
  },
  lavender: {
    name: "Lavender",
    description: "Soft purple elegant aesthetic",
    colors: {
      primary: "#7c3aed",
      secondary: "#a78bfa",
      accent: "#c4b5fd",
      background: "#faf5ff",
      foreground: "#581c87",
      muted: "#f3e8ff",
      border: "#e9d5ff",
    },
    borderRadius: 14,
    buttonBorderRadius: 14,
    subscribeBar: {
      buttonColor: "#7c3aed",
      buttonTextColor: "#ffffff",
      backgroundColor: "#ffffff",
      textColor: "#581c87",
      buttonBorderRadius: 14,
      inputBorderColor: "#e9d5ff",
      inputTextColor: "#581c87",
      inputPlaceholderColor: "#c4b5fd",
    },
    profileRingColor: "#faf5ff",
    creatorBar: {
      backgroundColor: "#7c3aed",
      textColor: "#ffffff",
      buttonColor: "#a78bfa",
      buttonTextColor: "#ffffff",
      buttonBorderRadius: 14,
    },
    stickyAddToCart: {
      backgroundColor: "#faf5ff",
      buttonColor: "#7c3aed",
      buttonTextColor: "#ffffff",
      borderRadius: 14,
    },
    productHeader: {
      buyButtonColor: "#7c3aed",
      buyButtonTextColor: "#ffffff",
      buttonsBorderRadius: 14,
    },
    sections: {
      headerBackgroundColor: "transparent",
      headerTextColor: "#581c87",
      featuredProductsBackgroundColor: "#f3e8ff",
      featuredProductsTextColor: "#581c87",
      footerBackgroundColor: "#ede9fe",
      footerTextColor: "#7c3aed",
      pageBackgroundColor: "#faf5ff",
    },
    productCard: {
      backgroundColor: "#ffffff",
      textColor: "#581c87",
      priceColor: "#a78bfa",
      borderColor: "#e9d5ff",
    },
    categoryFilter: {
      textColor: "#a78bfa",
      activeTextColor: "#581c87",
      borderColor: "#581c87",
    },
  },
  rose: {
    name: "Rose",
    description: "Romantic pink and rose tones",
    colors: {
      primary: "#be123c",
      secondary: "#f43f5e",
      accent: "#fb7185",
      background: "#fff1f2",
      foreground: "#881337",
      muted: "#ffe4e6",
      border: "#fecdd3",
    },
    borderRadius: 16,
    buttonBorderRadius: 16,
    subscribeBar: {
      buttonColor: "#be123c",
      buttonTextColor: "#ffffff",
      backgroundColor: "#ffffff",
      textColor: "#881337",
      buttonBorderRadius: 16,
      inputBorderColor: "#fecdd3",
      inputTextColor: "#881337",
      inputPlaceholderColor: "#fb7185",
    },
    profileRingColor: "#fff1f2",
    creatorBar: {
      backgroundColor: "#be123c",
      textColor: "#ffffff",
      buttonColor: "#f43f5e",
      buttonTextColor: "#ffffff",
      buttonBorderRadius: 16,
    },
    stickyAddToCart: {
      backgroundColor: "#fff1f2",
      buttonColor: "#be123c",
      buttonTextColor: "#ffffff",
      borderRadius: 16,
    },
    productHeader: {
      buyButtonColor: "#be123c",
      buyButtonTextColor: "#ffffff",
      buttonsBorderRadius: 16,
    },
    sections: {
      headerBackgroundColor: "transparent",
      headerTextColor: "#881337",
      featuredProductsBackgroundColor: "#ffe4e6",
      featuredProductsTextColor: "#881337",
      footerBackgroundColor: "#fce7f3",
      footerTextColor: "#be123c",
      pageBackgroundColor: "#fff1f2",
    },
    productCard: {
      backgroundColor: "#ffffff",
      textColor: "#881337",
      priceColor: "#f43f5e",
      borderColor: "#fecdd3",
    },
    categoryFilter: {
      textColor: "#f43f5e",
      activeTextColor: "#881337",
      borderColor: "#881337",
    },
  },
  midnight: {
    name: "Midnight",
    description: "Deep navy with gold accents",
    colors: {
      primary: "#1e3a5f",
      secondary: "#2563eb",
      accent: "#d4af37",
      background: "#0f172a",
      foreground: "#f1f5f9",
      muted: "#1e293b",
      border: "#334155",
    },
    borderRadius: 8,
    buttonBorderRadius: 8,
    subscribeBar: {
      buttonColor: "#d4af37",
      buttonTextColor: "#0f172a",
      backgroundColor: "#1e293b",
      textColor: "#f1f5f9",
      buttonBorderRadius: 8,
      inputBorderColor: "#334155",
      inputTextColor: "#f1f5f9",
      inputPlaceholderColor: "#94a3b8",
    },
    profileRingColor: "#0f172a",
    creatorBar: {
      backgroundColor: "#1e3a5f",
      textColor: "#f1f5f9",
      buttonColor: "#d4af37",
      buttonTextColor: "#0f172a",
      buttonBorderRadius: 8,
    },
    stickyAddToCart: {
      backgroundColor: "#1e293b",
      buttonColor: "#d4af37",
      buttonTextColor: "#0f172a",
      borderRadius: 8,
    },
    productHeader: {
      buyButtonColor: "#d4af37",
      buyButtonTextColor: "#0f172a",
      buttonsBorderRadius: 8,
    },
    sections: {
      headerBackgroundColor: "transparent",
      headerTextColor: "#f1f5f9",
      featuredProductsBackgroundColor: "#1e293b",
      featuredProductsTextColor: "#f1f5f9",
      footerBackgroundColor: "#0f172a",
      footerTextColor: "#94a3b8",
      pageBackgroundColor: "#0f172a",
    },
    productCard: {
      backgroundColor: "#1e293b",
      textColor: "#f1f5f9",
      priceColor: "#d4af37",
      borderColor: "#334155",
    },
    categoryFilter: {
      textColor: "#94a3b8",
      activeTextColor: "#f1f5f9",
      borderColor: "#d4af37",
    },
  },
  cream: {
    name: "Cream",
    description: "Warm beige vintage look",
    colors: {
      primary: "#78350f",
      secondary: "#a16207",
      accent: "#ca8a04",
      background: "#fefce8",
      foreground: "#422006",
      muted: "#fef9c3",
      border: "#fde047",
    },
    borderRadius: 6,
    buttonBorderRadius: 6,
    subscribeBar: {
      buttonColor: "#78350f",
      buttonTextColor: "#fefce8",
      backgroundColor: "#ffffff",
      textColor: "#422006",
      buttonBorderRadius: 6,
      inputBorderColor: "#fde047",
      inputTextColor: "#422006",
      inputPlaceholderColor: "#ca8a04",
    },
    profileRingColor: "#fefce8",
    creatorBar: {
      backgroundColor: "#78350f",
      textColor: "#fefce8",
      buttonColor: "#a16207",
      buttonTextColor: "#fefce8",
      buttonBorderRadius: 6,
    },
    stickyAddToCart: {
      backgroundColor: "#fefce8",
      buttonColor: "#78350f",
      buttonTextColor: "#fefce8",
      borderRadius: 6,
    },
    productHeader: {
      buyButtonColor: "#78350f",
      buyButtonTextColor: "#fefce8",
      buttonsBorderRadius: 6,
    },
    sections: {
      headerBackgroundColor: "transparent",
      headerTextColor: "#422006",
      featuredProductsBackgroundColor: "#fef9c3",
      featuredProductsTextColor: "#422006",
      footerBackgroundColor: "#fef3c7",
      footerTextColor: "#78350f",
      pageBackgroundColor: "#fefce8",
    },
    productCard: {
      backgroundColor: "#ffffff",
      textColor: "#422006",
      priceColor: "#a16207",
      borderColor: "#fde047",
    },
    categoryFilter: {
      textColor: "#a16207",
      activeTextColor: "#422006",
      borderColor: "#422006",
    },
  },
  slate: {
    name: "Slate",
    description: "Modern gray professional",
    colors: {
      primary: "#475569",
      secondary: "#64748b",
      accent: "#94a3b8",
      background: "#f8fafc",
      foreground: "#1e293b",
      muted: "#f1f5f9",
      border: "#e2e8f0",
    },
    borderRadius: 8,
    buttonBorderRadius: 8,
    subscribeBar: {
      buttonColor: "#475569",
      buttonTextColor: "#ffffff",
      backgroundColor: "#ffffff",
      textColor: "#1e293b",
      buttonBorderRadius: 8,
      inputBorderColor: "#e2e8f0",
      inputTextColor: "#1e293b",
      inputPlaceholderColor: "#94a3b8",
    },
    profileRingColor: "#f8fafc",
    creatorBar: {
      backgroundColor: "#475569",
      textColor: "#ffffff",
      buttonColor: "#64748b",
      buttonTextColor: "#ffffff",
      buttonBorderRadius: 8,
    },
    stickyAddToCart: {
      backgroundColor: "#f8fafc",
      buttonColor: "#475569",
      buttonTextColor: "#ffffff",
      borderRadius: 8,
    },
    productHeader: {
      buyButtonColor: "#475569",
      buyButtonTextColor: "#ffffff",
      buttonsBorderRadius: 8,
    },
    sections: {
      headerBackgroundColor: "transparent",
      headerTextColor: "#1e293b",
      featuredProductsBackgroundColor: "#f1f5f9",
      featuredProductsTextColor: "#1e293b",
      footerBackgroundColor: "#f1f5f9",
      footerTextColor: "#64748b",
      pageBackgroundColor: "#f8fafc",
    },
    productCard: {
      backgroundColor: "#ffffff",
      textColor: "#1e293b",
      priceColor: "#64748b",
      borderColor: "#e2e8f0",
    },
    categoryFilter: {
      textColor: "#64748b",
      activeTextColor: "#1e293b",
      borderColor: "#1e293b",
    },
  },
  noir: {
    name: "Noir",
    description: "Pure black and white contrast",
    colors: {
      primary: "#000000",
      secondary: "#262626",
      accent: "#737373",
      background: "#ffffff",
      foreground: "#000000",
      muted: "#fafafa",
      border: "#e5e5e5",
    },
    borderRadius: 0,
    buttonBorderRadius: 0,
    subscribeBar: {
      buttonColor: "#000000",
      buttonTextColor: "#ffffff",
      backgroundColor: "#ffffff",
      textColor: "#000000",
      buttonBorderRadius: 0,
      inputBorderColor: "#000000",
      inputTextColor: "#000000",
      inputPlaceholderColor: "#737373",
    },
    profileRingColor: "#ffffff",
    creatorBar: {
      backgroundColor: "#000000",
      textColor: "#ffffff",
      buttonColor: "#262626",
      buttonTextColor: "#ffffff",
      buttonBorderRadius: 0,
    },
    stickyAddToCart: {
      backgroundColor: "#ffffff",
      buttonColor: "#000000",
      buttonTextColor: "#ffffff",
      borderRadius: 0,
    },
    productHeader: {
      buyButtonColor: "#000000",
      buyButtonTextColor: "#ffffff",
      buttonsBorderRadius: 0,
    },
    sections: {
      headerBackgroundColor: "transparent",
      headerTextColor: "#000000",
      featuredProductsBackgroundColor: "#fafafa",
      featuredProductsTextColor: "#000000",
      footerBackgroundColor: "#fafafa",
      footerTextColor: "#525252",
      pageBackgroundColor: "#ffffff",
    },
    productCard: {
      backgroundColor: "#ffffff",
      textColor: "#000000",
      priceColor: "#525252",
      borderColor: "#e5e5e5",
    },
    categoryFilter: {
      textColor: "#737373",
      activeTextColor: "#000000",
      borderColor: "#000000",
    },
  },
}
