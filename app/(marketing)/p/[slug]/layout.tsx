import type React from "react"
import { createClient } from "@/lib/supabase/server"
import { getThemeSkeletonColors } from "@/lib/theme-skeleton-colors"
import type { ThemePreset } from "@/lib/store-builder/types"

interface ProductLayoutProps {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

export default async function ProductLayout({ children, params }: ProductLayoutProps) {
  const { slug } = await params
  const supabase = await createClient()

  // Quick query to get just the theme preset for skeleton loading
  let themePreset: ThemePreset = "default"

  try {
    // First get the product to find the creator
    let { data: product } = await supabase
      .from("products")
      .select("creator_id")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle()

    // If not found, check slug history
    if (!product) {
      const { data: slugHistory } = await supabase
        .from("product_slug_history")
        .select(`
          products!inner (
            creator_id,
            status
          )
        `)
        .eq("old_slug", slug)
        .maybeSingle()

      if (slugHistory?.products && (slugHistory.products as any).status === "published") {
        product = slugHistory.products as any
      }
    }

    if (product?.creator_id) {
      // Get the theme preset from the default product template or shop config
      const { data: config } = await supabase
        .from("store_builder_configs")
        .select("published_config")
        .eq("creator_id", product.creator_id)
        .eq("page_type", "product")
        .maybeSingle()

      themePreset = config?.published_config?.globalSettings?.themePreset || "default"
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
