import type { ThemePreset } from "@/lib/store-builder/types"

// Get theme-specific colors for skeleton loading
// This is a shared utility that can be used by both server and client components
export function getThemeSkeletonColors(themePreset: ThemePreset = "default") {
  switch (themePreset) {
    case "astrid":
      return {
        backgroundColor: "#0a0a0a",
        skeletonColor: "#1a1a1a",
        textColor: "#fafafa",
      }
    case "midnight":
      return {
        backgroundColor: "#0f172a",
        skeletonColor: "#1e293b",
        textColor: "#f8fafc",
      }
    case "cream":
      return {
        backgroundColor: "#FAF4E8",
        skeletonColor: "#e8dfc9",
        textColor: "#000000",
      }
    case "bubble":
      return {
        backgroundColor: "#ffffff",
        skeletonColor: "#f5f3ff",
        textColor: "#000000",
      }
    case "pink":
      return {
        backgroundColor: "#ffffff",
        skeletonColor: "#fce7f3",
        textColor: "#000000",
      }
    case "air":
      return {
        backgroundColor: "#ffffff",
        skeletonColor: "#e5e7eb",
        textColor: "#000000",
      }
    case "blacks":
      return {
        backgroundColor: "#ffffff",
        skeletonColor: "#e5e7eb",
        textColor: "#000000",
      }
    case "rose":
      return {
        backgroundColor: "#fff1f2",
        skeletonColor: "#ffe4e6",
        textColor: "#000000",
      }
    case "royal":
      return {
        backgroundColor: "#f5f3ff",
        skeletonColor: "#ddd6fe",
        textColor: "#000000",
      }
    case "ocean":
      return {
        backgroundColor: "#ecfeff",
        skeletonColor: "#cffafe",
        textColor: "#000000",
      }
    case "sunset":
      return {
        backgroundColor: "#fff7ed",
        skeletonColor: "#ffedd5",
        textColor: "#000000",
      }
    case "forest":
      return {
        backgroundColor: "#f0fdf4",
        skeletonColor: "#dcfce7",
        textColor: "#000000",
      }
    default:
      return {
        backgroundColor: "#ffffff",
        skeletonColor: undefined, // Use default accent
        textColor: "#000000",
      }
  }
}

// Export helper to get loading background color (for use in loading.tsx)
export function getLoadingBackground(themePreset: ThemePreset = "default") {
  return getThemeSkeletonColors(themePreset).backgroundColor
}
