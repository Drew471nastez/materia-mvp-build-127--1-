import type React from "react"
import { createClient } from "@/lib/supabase/server"
import { getThemeSkeletonColors } from "@/lib/theme-skeleton-colors"
import type { ThemePreset } from "@/lib/store-builder/types"

interface ShopLayoutProps {
  children: React.ReactNode
  params: Promise<{ username: string }>
}

export default async function ShopLayout({ children, params }: ShopLayoutProps) {
  const { username } = await params
  const supabase = await createClient()

  // Quick query to get just the theme preset for skeleton loading
  let themePreset: ThemePreset = "default"

  try {
    // Get the profile to find the creator
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .ilike("username", username)
      .maybeSingle()

    if (profile?.id) {
      // Get the creator
      const { data: creator } = await supabase
        .from("creators")
        .select("id")
        .eq("user_id", profile.id)
        .maybeSingle()

      if (creator?.id) {
        // Get the theme preset from the shop config
        const { data: config } = await supabase
          .from("store_builder_configs")
          .select("published_config")
          .eq("creator_id", creator.id)
          .eq("page_type", "shop")
          .maybeSingle()

        themePreset = config?.published_config?.globalSettings?.themePreset || "default"
      }
    }
  } catch (error) {
    // Silently fall back to default theme on error
    console.error("Error fetching theme preset:", error)
  }

  const colors = getThemeSkeletonColors(themePreset)

  return (
    <div
      style={{
        // Set CSS custom properties for skeleton loading
        "--skeleton-bg": colors.backgroundColor,
        "--skeleton-color": colors.skeletonColor || "#e5e7eb",
        "--skeleton-text": colors.textColor,
        "--skeleton-border": themePreset === "astrid" ? "#2a2a2a" : "#e5e7eb",
        "--skeleton-card-bg": themePreset === "astrid" ? "#1a1a1a" : colors.backgroundColor,
      } as React.CSSProperties}
    >
      {children}
    </div>
  )
}
