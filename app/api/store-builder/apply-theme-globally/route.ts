import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { creatorPageStore } from "@/lib/team/creator-page"
import { NO_ACCESS } from "@/lib/team/server"
import { themePresets } from "@/lib/store-builder/defaults"
import type { ThemePreset, Section } from "@/lib/store-builder/types"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

// POST - Apply theme globally to ALL product page configs
// This ensures that when a theme preset is applied on one product page,
// it propagates to ALL products and ALL sections including Reviews and More from Seller
export async function POST(request: Request) {
  const supabase = await createClient()

  const who = await routeUser()
  if (who.kind === "unavailable") return authUnavailableResponse()
  const user = who.kind === "user" ? who.user : null
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { themePreset, globalSettings, globalColors, headerSettings } = await request.json()

  if (!themePreset) {
    return NextResponse.json({ error: "Missing themePreset" }, { status: 400 })
  }

  const theme = themePresets[themePreset as ThemePreset]
  if (!theme) {
    return NextResponse.json({ error: "Invalid theme preset" }, { status: 400 })
  }

  // Get creator
  /* Round 42: the owner's own page, or the store's for a team member with Creator page (lib/team/creator-page). */
  const page = await creatorPageStore(supabase, user.id)
  if (page.kind === "denied") return NextResponse.json({ error: NO_ACCESS }, { status: 403 })
  if (page.kind === "unreachable") return NextResponse.json({ error: "Storelib could not reach your store just now. Try again in a moment." }, { status: 503 })
  const db = page.db
  const creator = page.creatorId ? { id: page.creatorId } : null

  if (!creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 })
  }

  console.log("[v0] Applying theme globally", { themePreset, creatorId: creator.id })

  // Helper function to apply theme colors to all sections
  const applyThemeToSections = (sections: Section[]): Section[] => {
    return sections.map((section: Section) => {
      const newSection = { ...section, settings: { ...section.settings } }

      // Apply more-from-seller section colors
      if (section.type === "more-from-seller") {
        newSection.settings = {
          ...newSection.settings,
          colors: {
            backgroundColor: theme.sections.featuredProductsBackgroundColor,
            textColor: theme.sections.featuredProductsTextColor || theme.colors.foreground,
          },
          productCardColors: {
            backgroundColor: theme.productCard.backgroundColor,
            textColor: theme.productCard.textColor,
            priceColor: theme.productCard.priceColor,
            borderColor: theme.productCard.borderColor,
          },
        }
      }

      // Apply reviews section colors
      if (section.type === "reviews") {
        newSection.settings = {
          ...newSection.settings,
          colors: {
            backgroundColor: theme.reviewsSection.backgroundColor,
            textColor: theme.reviewsSection.textColor,
          },
          reviewsColors: {
            starColor: theme.reviewsSection.starColor,
            cardBackgroundColor: theme.reviewsSection.cardBackgroundColor,
            cardBorderColor: theme.reviewsSection.cardBorderColor,
          },
        }
      }

      // Apply text-block section colors
      if (section.type === "text-block") {
        newSection.settings = {
          ...newSection.settings,
          colors: {
            backgroundColor: theme.textBlock.backgroundColor,
            textColor: theme.textBlock.headlineColor,
          },
          headlineColor: theme.textBlock.headlineColor,
          contentColor: theme.textBlock.contentColor,
        }
      }

      // Apply image-text section colors
      if (section.type === "image-text") {
        newSection.settings = {
          ...newSection.settings,
          colors: {
            backgroundColor: theme.imageText.backgroundColor,
            textColor: theme.imageText.textColor,
          },
          buttonColor: theme.imageText.buttonColor,
          buttonTextColor: theme.imageText.buttonTextColor,
          buttonBorderRadius: theme.buttonBorderRadius,
        }
      }

      // Apply benefits section colors
      if (section.type === "benefits") {
        newSection.settings = {
          ...newSection.settings,
          colors: {
            backgroundColor: theme.benefits.backgroundColor,
            textColor: theme.benefits.textColor,
          },
          iconColor: theme.benefits.iconColor,
        }
      }

      // Apply announcement bar colors
      if (section.type === "announcement-bar") {
        newSection.settings = {
          ...newSection.settings,
          colors: {
            backgroundColor: theme.announcementBar.backgroundColor,
            textColor: theme.announcementBar.textColor,
          },
        }
      }

      // Apply about section colors
      if (section.type === "about") {
        newSection.settings = {
          ...newSection.settings,
          colors: {
            backgroundColor: theme.about.backgroundColor,
            textColor: theme.about.textColor,
          },
          mutedTextColor: theme.about.mutedTextColor,
        }
      }

      // Apply featured-products section colors
      if (section.type === "featured-products") {
        newSection.settings = {
          ...newSection.settings,
          colors: {
            backgroundColor: theme.sections.featuredProductsBackgroundColor,
            textColor: theme.sections.featuredProductsTextColor || theme.colors.foreground,
          },
          productCardColors: {
            backgroundColor: theme.productCard.backgroundColor,
            textColor: theme.productCard.textColor,
            priceColor: theme.productCard.priceColor,
            borderColor: theme.productCard.borderColor,
          },
          categoryFilterColors: {
            textColor: theme.categoryFilter.textColor,
            activeTextColor: theme.categoryFilter.activeTextColor,
            borderColor: theme.categoryFilter.borderColor,
          },
        }
      }

      return newSection
    })
  }

  try {
    // Fetch ALL product-specific configs for this creator
    const { data: productConfigs, error: fetchError } = await db
      .from("product_page_configs")
      .select("id, product_id, draft_config, published_config")
      .eq("creator_id", creator.id)

    if (fetchError) {
      console.error("[v0] Error fetching product configs:", fetchError)
      return NextResponse.json({ error: "Failed to fetch product configs" }, { status: 500 })
    }

    console.log("[v0] Found product configs to update:", productConfigs?.length || 0)

    // Update each product config with the new theme
    const updatePromises = (productConfigs || []).map(async (config) => {
      const draftConfig = config.draft_config || {}
      const publishedConfig = config.published_config || {}

      // Update draft config
      const updatedDraftConfig = {
        ...draftConfig,
        globalSettings: globalSettings || draftConfig.globalSettings,
        globalColors: globalColors || draftConfig.globalColors,
        headerSettings: {
          ...draftConfig.headerSettings,
          ...headerSettings,
        },
        sections: applyThemeToSections(draftConfig.sections || []),
      }

      // Update published config
      const updatedPublishedConfig = {
        ...publishedConfig,
        globalSettings: globalSettings || publishedConfig.globalSettings,
        globalColors: globalColors || publishedConfig.globalColors,
        headerSettings: {
          ...publishedConfig.headerSettings,
          ...headerSettings,
        },
        sections: applyThemeToSections(publishedConfig.sections || []),
      }

      // Save the updated configs
      const { error: updateError } = await db
        .from("product_page_configs")
        .update({
          draft_config: updatedDraftConfig,
          published_config: updatedPublishedConfig,
          updated_at: new Date().toISOString(),
        })
        .eq("id", config.id)

      if (updateError) {
        console.error(`[v0] Error updating product config ${config.product_id}:`, updateError)
        return { success: false, productId: config.product_id }
      }

      return { success: true, productId: config.product_id }
    })

    const results = await Promise.all(updatePromises)
    const successCount = results.filter((r) => r.success).length
    const failCount = results.filter((r) => !r.success).length

    console.log("[v0] Theme applied globally", { successCount, failCount })

    return NextResponse.json({
      success: true,
      updated: successCount,
      failed: failCount,
      message: `Theme applied to ${successCount} product configs`,
    })
  } catch (error) {
    console.error("[v0] Error applying theme globally:", error)
    return NextResponse.json({ error: "Failed to apply theme globally" }, { status: 500 })
  }
}
